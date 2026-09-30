import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalLiteral, extractDefaultProps, rootProps, rootSlugs, stripPrivate } from '../lib/root.ts';
import { nextVersion, parseVName, vName } from '../lib/versions.ts';
import { diffScenarios } from '../commands/sync.ts';
import { countLines, extractExcerpts, isBinary, languageStats } from '../commands/scan.ts';

// Exactly what Studio's 💾 (codemods setCompositionDefaultProps 4.0.530) writes: unquoted keys,
// single quotes, `as const` on enums, trailing commas, derived `_tokens` kept.
const STUDIO_LITERAL = `{
				slug: 'demo',
				title: 'Star\\'ter "x" }',
				format: '9:16' as const,
				fps: 30,
				theme: {
					preset: 'interstellar',
					accent: '#ff0000',
				},
				scenes: [{
					id: 'title',
					type: 'title' as const,
					seconds: 3,
					title: 'Hi {there} // not a comment',
				}, {
					id: 'outro',
					type: 'outro' as const,
					seconds: 4,
					code: 'a\\n\`b\`',
					_tokens: [{ c: 1 }],
				}],
				_tokens: {
					x: 1,
				},
			}`;

const jsxRoot = (slug: string, literal: string) => `
		{/* nolan:begin ${slug} */}
		<Composition id="${slug}" component={Video} defaultProps={${literal}} />
		{/* nolan:end ${slug} */}`;

const arrayRoot = (slug: string, literal: string) => `
		{[
			// nolan:begin ${slug}
			<Composition
				key="${slug}"
				id="${slug}"
				defaultProps={${literal}}
			/>,
			// nolan:end ${slug}
		]}`;

test('sync: extracts and evaluates a Studio-style literal (both marker styles)', () => {
	for (const wrap of [jsxRoot, arrayRoot]) {
		const src = wrap('demo-2', '{ slug: "demo-2", fps: 60 }') + wrap('demo', STUDIO_LITERAL);
		assert.deepEqual(rootSlugs(src), ['demo-2', 'demo']);
		const props = rootProps('demo', src) as Record<string, any>;
		assert.equal(props.title, 'Star\'ter "x" }');
		assert.equal(props.format, '9:16');
		assert.equal(props.scenes[0].title, 'Hi {there} // not a comment');
		assert.equal(props.scenes[1].code, 'a\n`b`');
		assert.equal('_tokens' in props, false);
		assert.equal('_tokens' in props.scenes[1], false, 'strip is recursive');
		assert.deepEqual(rootProps('demo-2', src), { slug: 'demo-2', fps: 60 }, 'slug prefix does not leak into another block');
		assert.equal(rootProps('missing', src), undefined);
	}
});

test('sync: helpers', () => {
	assert.equal(extractDefaultProps('// nolan:begin x\n<Composition id="x" />\n// nolan:end x', 'x'), null);
	assert.deepEqual(evalLiteral(`{ a: 'b' as const, src: staticFile("x.mp3"), }`), { a: 'b', src: 'x.mp3' });
	assert.equal((evalLiteral(`{ s: 'keep as const inside strings' }`) as { s: string }).s, 'keep as const inside strings');
	assert.deepEqual(stripPrivate({ a: 1, _b: 2, c: [{ _d: 1, e: 2 }] }), { a: 1, c: [{ e: 2 }] });
});

test('sync: diff summary', () => {
	const a = { title: 'A', theme: { preset: 'x', accent: '#000' }, scenes: [{ id: 's1', type: 'title', title: 'T' }, { id: 's2', type: 'code' }] };
	const b = { title: 'A', theme: { preset: 'x', accent: '#fff' }, scenes: [{ id: 's2', type: 'code' }, { id: 's1', type: 'title', title: 'T2', seconds: 3 }, { id: 's3', type: 'quote' }] };
	assert.deepEqual(diffScenarios(a, b), [
		'changed: theme.accent',
		'~ scene "s1": title, seconds',
		'+ scene "s3" (quote)',
		'scenes reordered: s2, s1, s3',
	]);
	assert.deepEqual(diffScenarios(a, a), []);
});

test('versions: numbering', () => {
	assert.equal(vName(1), 'v001');
	assert.equal(vName(1234), 'v1234');
	assert.equal(parseVName('v007'), 7);
	assert.equal(parseVName('12'), 12);
	assert.equal(parseVName('v003.json'), 3);
	assert.equal(parseVName('latest'), undefined);
	assert.equal(nextVersion([]), 1);
	assert.equal(nextVersion([3, 1, 9]), 10);
});

test('scan: language stats, binary detection, line counts', () => {
	const stats = languageStats([
		{ path: 'src/a.ts', lines: 60 }, { path: 'src/b.tsx', lines: 15 }, { path: 'x.py', lines: 25 },
		{ path: 'logo.svgz', lines: 999 }, { path: 'Makefile', lines: 10 },
	]);
	assert.deepEqual(stats, [
		{ language: 'TypeScript', files: 2, lines: 75, percent: 75 },
		{ language: 'Python', files: 1, lines: 25, percent: 25 },
	]);
	assert.deepEqual(languageStats([]), []);
	assert.equal(isBinary(Buffer.from([0x89, 0x50, 0x00, 0x47])), true);
	assert.equal(isBinary(Buffer.from('plain text')), false);
	assert.equal(countLines(''), 0);
	assert.equal(countLines('a\nb\n'), 2);
	assert.equal(countLines('a\nb'), 2);
});

test('scan: code excerpts', () => {
	const ts = [
		'import x from "y";',
		'export async function loadThing(id: string) {',
		'  const a = "}"; // brace in string',
		'  if (!id) {',
		'    throw new Error("no id");',
		'  }',
		'  return a + id;',
		'}',
		'const tiny = () => 1;',
	].join('\n');
	const ex = extractExcerpts('src/a.ts', ts);
	assert.equal(ex.length, 1);
	assert.equal(ex[0].name, 'loadThing');
	assert.equal(ex[0].line, 2);
	assert.equal(ex[0].lines, 7);
	const py = 'def greet(name):\n    """Hi."""\n    msg = "hi " + name\n    print(msg)\n    return msg\n\nprint(1)\n';
	const pe = extractExcerpts('m.py', py);
	assert.equal(pe[0].name, 'greet');
	assert.equal(pe[0].lines, 5);
});

// `nolan sync <slug> [--force]`: pull Studio Props-panel edits (inline literal in src/Root.tsx) into scenario.json.
import { isDeepStrictEqual } from 'node:util';
import { parseArgs } from '../lib/args.ts';
import { fail, info, next, ok } from '../lib/log.ts';
import { assertSlug } from '../lib/paths.ts';
import { readBase, readRoot, rootProps, writeBase } from '../lib/root.ts';
import { loadScenario, saveScenario, validateScenario } from '../lib/scenario.ts';
import { readState } from '../lib/state.ts';
import { snapshot, vName } from '../lib/versions.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

// Human summary of what changed from `a` to `b`: field paths, and scenes matched by id.
export const diffScenarios = (a: Obj, b: Obj): string[] => {
	const fields: string[] = [];
	const walk = (x: unknown, y: unknown, path: string): void => {
		if (isDeepStrictEqual(x, y)) return;
		if (isObj(x) && isObj(y)) for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path ? `${path}.${k}` : k);
		else fields.push(path);
	};
	for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (k !== 'scenes') walk(a[k], b[k], k);
	const out = fields.length ? [`changed: ${fields.join(', ')}`] : [];

	const sa = (a.scenes ?? []) as Obj[];
	const sb = (b.scenes ?? []) as Obj[];
	const byId = (list: Obj[]) => new Map(list.map((s) => [String(s.id), s]));
	const ma = byId(sa), mb = byId(sb);
	for (const [id, s] of mb) {
		const old = ma.get(id);
		if (!old) { out.push(`+ scene "${id}" (${String(s.type)})`); continue; }
		const keys = [...new Set([...Object.keys(old), ...Object.keys(s)])].filter((k) => !isDeepStrictEqual(old[k], s[k]));
		if (keys.length) out.push(`~ scene "${id}": ${keys.join(', ')}`);
	}
	for (const id of ma.keys()) if (!mb.has(id)) out.push(`- scene "${id}"`);
	const common = (list: Obj[], other: Map<string, Obj>) => list.map((s) => String(s.id)).filter((id) => other.has(id));
	if (!isDeepStrictEqual(common(sa, mb), common(sb, ma))) out.push(`scenes reordered: ${sb.map((s) => s.id).join(', ')}`);
	return out;
};

// Returns true when scenario.json was updated. Fails (exit 1) on invalid props or a two-sided conflict.
export const syncProject = (slug: string, force = false): boolean => {
	const props = rootProps(slug, readRoot());
	if (props === undefined) return fail(`src/Root.tsx has no composition for "${slug}"`, `nolan studio ${slug}`);
	const v = validateScenario(props);
	if (!v.ok) return fail(`Studio props for "${slug}" are invalid:\n${v.error}`, 'correct the listed fields in the Studio Props panel (💾), then sync again');
	if (v.scenario.slug !== slug) return fail(`Studio props have slug "${v.scenario.slug}", expected "${slug}"`, 'set slug back in the Props panel');

	const studio = plain(v.scenario) as Obj;
	const current = plain(loadScenario(slug)) as Obj;
	const baseRaw = readBase(slug);
	const baseV = baseRaw === undefined ? undefined : validateScenario(baseRaw);
	const base = baseV?.ok ? (plain(baseV.scenario) as Obj) : undefined;

	if (isDeepStrictEqual(studio, current)) {
		writeBase(slug, current);
		ok(`${slug}: Studio and scenario.json are already in sync`);
		return false;
	}
	if (base && isDeepStrictEqual(studio, base)) {
		ok(`${slug}: no Studio edits; scenario.json is newer than the Studio view`);
		info(`studio: refresh it with nolan studio ${slug}`);
		return false;
	}
	// No base (fresh clone, base deleted): we cannot tell which side changed, so never pick one silently.
	if ((!base || !isDeepStrictEqual(current, base)) && !force) {
		if (base) {
			info('Studio edits:');
			for (const l of diffScenarios(base, studio)) info(`  ${l}`);
			info('scenario.json edits:');
			for (const l of diffScenarios(base, current)) info(`  ${l}`);
		} else {
			info('Studio differs from scenario.json (no .studio-base.json to tell which side changed):');
			for (const l of diffScenarios(current, studio)) info(`  ${l}`);
		}
		return fail(base ? `${slug}: both Studio and scenario.json changed since nolan studio` : `${slug}: Studio props and scenario.json differ and nolan studio never recorded a base`,
			`keep Studio's: nolan sync ${slug} --force (scenario.json is snapshotted first) | keep scenario.json: nolan studio ${slug} --force`);
	}

	const before = snapshot(slug, 'before sync');
	const saved = saveScenario(slug, studio);
	writeBase(slug, saved);
	ok(`${slug}: scenario.json updated from Studio (previous kept as ${vName(before.version)})`);
	for (const l of diffScenarios(current, studio)) info(`  ${l}`);
	return true;
};

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args, ['force']);
	const slug = assertSlug(_[0]);
	readState(slug);
	const changed = syncProject(slug, !!flags.force);
	next(changed ? `nolan validate ${slug}  (then nolan stills ${slug})` : `nolan stills ${slug}  |  nolan render ${slug}`);
};

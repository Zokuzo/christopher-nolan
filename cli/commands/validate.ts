import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Scenario, Scene } from '../../src/schema.ts';
import { sceneTimeline, totalFrames } from '../../src/lib/timing.ts';
import { parseArgs } from '../lib/args.ts';
import { info, json, next, ok, warn } from '../lib/log.ts';
import { assertSlug, PUBLIC_DIR } from '../lib/paths.ts';
import { readLock } from '../lib/lock.ts';
import { loadScenario } from '../lib/scenario.ts';
import { readState } from '../lib/state.ts';

const words = (s?: string): number => (s ? s.split(/\s+/).filter(Boolean).length : 0);

// Words the viewer has to read on screen (narration counts only when it is a caption, i.e. no voice file).
const onScreenWords = (s: Scene): number =>
	words(s.title) + words(s.subtitle) + words(s.text) + words(s.quote) + words(s.author) + words(s.cta)
	+ (s.bullets ?? []).reduce((a, b) => a + words(b), 0)
	+ (s.stats ?? []).reduce((a, x) => a + words(x.label), 0)
	+ (s.voiceSrc ? 0 : words(s.narration));

const missingPublic = (p?: string): boolean => !!p && !/^(https?:|data:)/.test(p) && !existsSync(join(PUBLIC_DIR, p.replace(/^\/+/, '')));

// 9:16 pacing (scenario.md, Vertical 9:16): dense scenes need time to type and read, text scenes stay short.
const maxSeconds9x16 = (type: Scene['type']): number =>
	type === 'code' || type === 'terminal' || type === 'diagram' || type === 'tree' ? 7 : type === 'outro' ? 6 : 4;

// Lock entries that the CC BY / BY-SA licences require to be credited on screen.
export const ccCredits = (slug: string): string[] => {
	try { return readLock(slug).filter((e) => /^CC BY/i.test(e.license)).map((e) => `"${e.title}"`); }
	catch { return []; }
};

export const scenarioWarnings = (sc: Scenario): string[] => {
	const w: string[] = [];
	const ids = new Set<string>();
	const vertical = sc.format === '9:16';
	const L = vertical ? { codeLines: 24, lineChars: 40 } : { codeLines: 18, lineChars: 80 };
	const outro = sc.scenes.findIndex((s) => s.type === 'outro');
	if (outro >= 0 && outro !== sc.scenes.length - 1) w.push(`scene "${sc.scenes[outro].id}": the outro must be the last scene`);
	const cc = ccCredits(sc.slug);
	if (outro < 0 && cc.length) w.push(`no outro scene: the CC BY credits (${cc.join(', ')}) only appear in the outro; add one last`);
	if (missingPublic(sc.audio.music.src)) w.push(`audio.music.src "${sc.audio.music.src}" not found under public/ (nolan audio music ${sc.slug})`);
	for (const s of sc.scenes) {
		const at = `scene "${s.id}"`;
		if (ids.has(s.id)) w.push(`${at}: duplicate id (ids must be unique for sync/stills)`);
		ids.add(s.id);
		for (const key of ['image', 'background', 'voiceSrc'] as const) {
			if (missingPublic(s[key])) w.push(`${at}: ${key} "${s[key]}" not found under public/`);
		}
		const need = Math.max(1.5, onScreenWords(s) / 3.5) + 1; // + ~1 s for the reveal (scenario.md, Timing)
		if (s.seconds < need) w.push(`${at}: ${onScreenWords(s)} words need ≥ ${need.toFixed(1)}s to read (incl. 1s reveal), has ${s.seconds}s (shorten text or raise seconds)`);
		const maxBullets = sc.format === '1:1' ? 3 : 4;
		if ((s.bullets?.length ?? 0) > maxBullets) w.push(`${at}: ${s.bullets!.length} bullets (max ${maxBullets} reads well; split the scene)`);
		const codeLines = s.code ? s.code.replace(/\n+$/, '').split('\n') : [];
		if (codeLines.length > L.codeLines) w.push(`${at}: code has ${codeLines.length} lines (max ${L.codeLines} in ${sc.format}; trim to the essential part)`);
		const wide = codeLines.filter((l) => l.replace(/\t/g, '  ').length > L.lineChars).length;
		if (wide) w.push(`${at}: ${wide} code line(s) over ${L.lineChars} chars (${sc.format}); shorten or wrap them`);
		if (s.type === 'code' && s.typing !== false && codeLines.length > 10) w.push(`${at}: typing is on (default) for ${codeLines.length} lines; set "typing": false above 10 lines`);
		for (const [cond, msg] of [
			[s.type === 'title' && words(s.title) > 4, `title has ${words(s.title)} words (max 4)`],
			[s.type === 'title' && vertical && (s.title?.length ?? 0) > 24, `title is ${s.title?.length} chars (max 24 in 9:16)`],
			[s.type === 'kinetic' && words(s.text) > 12, `kinetic has ${words(s.text)} words (max 12)`],
			[s.type === 'bullets' && (s.bullets ?? []).some((b) => words(b) > 7), 'a bullet has more than 7 words'],
			[s.type === 'quote' && words(s.quote) > 25, `quote has ${words(s.quote)} words (max 25)`],
			[s.type === 'stats' && (s.stats?.length ?? 0) > 3, `${s.stats?.length} stats (max 3)`],
			[s.type === 'diagram' && (s.nodes?.length ?? 0) > 6, `${s.nodes?.length} diagram nodes (max 6)`],
			[s.type === 'terminal' && (s.commands?.length ?? 0) > 3, `${s.commands?.length} terminal commands (max 3)`],
			[s.type === 'terminal' && (s.commands ?? []).some((c) => (c.output ?? '').trim().split('\n').length > 6), 'a terminal output has more than 6 lines'],
			[s.type === 'tree' && (s.tree?.length ?? 0) > 25, `${s.tree?.length} tree paths (max 25)`],
			[vertical && s.seconds > maxSeconds9x16(s.type), `${s.seconds}s is long for 9:16 (max ${maxSeconds9x16(s.type)}s for ${s.type}; split the scene)`],
		] as const) if (cond) w.push(`${at}: ${msg}`);
		if (s.type === 'code' && !s.code) w.push(`${at}: code scene without code`);
		if (s.type === 'bullets' && !s.bullets?.length) w.push(`${at}: bullets scene without bullets`);
		if (s.type === 'image' && !s.image) w.push(`${at}: image scene without image`);
		if (s.type === 'diagram') {
			const nodes = new Set((s.nodes ?? []).map((n) => n.id));
			if (!nodes.size) w.push(`${at}: diagram without nodes`);
			for (const e of s.edges ?? []) if (!nodes.has(e.from) || !nodes.has(e.to)) w.push(`${at}: edge ${e.from}→${e.to} references an unknown node`);
		}
		for (const x of s.sfx ?? []) if (x.at > s.seconds) w.push(`${at}: sfx "${x.name}" at ${x.at}s is after the scene end (${s.seconds}s)`);
	}
	return w;
};

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const slug = assertSlug(_[0]);
	const sc = loadScenario(slug); // exits with the zod error list when invalid
	const fps = sc.fps;
	const timeline = sceneTimeline(sc);
	const total = totalFrames(sc);
	const warnings = scenarioWarnings(sc);
	if (flags.json) return json({ ok: true, fps, totalFrames: total, seconds: total / fps, scenes: timeline, warnings });

	ok(`projects/${slug}/scenario.json is valid (${sc.format} @${fps}fps, theme ${sc.theme.preset})`);
	const w = Math.max(...sc.scenes.map((s) => s.id.length));
	timeline.forEach((t, i) => {
		const s = sc.scenes[i];
		info(`  ${String(i + 1).padStart(2)}. ${t.id.padEnd(w)}  ${s.type.padEnd(8)} ${(t.from / fps).toFixed(2).padStart(6)}s → ${((t.from + t.frames) / fps).toFixed(2).padStart(6)}s  (${s.seconds}s)`);
	});
	info(`total: ${(total / fps).toFixed(2)}s (${total} frames, transition overlaps included)`);
	for (const x of warnings) warn(x);
	const stage = readState(slug).stage;
	if (warnings.length) return next(`fix the ${warnings.length} warning(s) in scenario.json, then nolan validate ${slug}`);
	next(stage === 'scenario' ? `nolan stage ${slug} assets` : `nolan status ${slug}`);
};

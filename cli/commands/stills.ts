// `nolan stills <slug> [--every S] [--frames a,b,c]`: PNG frames for the agent's own visual QA
// (default: one per scene, once its text has finished animating).
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Scenario } from '../../src/schema.ts';
import { settleFrame } from '../../src/lib/cues.ts';
import { sceneTimeline, totalFrames, transitionFrames } from '../../src/lib/timing.ts';
import { num, parseArgs, str } from '../lib/args.ts';
import { fail, info, next, ok } from '../lib/log.ts';
import { assertSlug, CACHE_DIR, projectDir, ROOT } from '../lib/paths.ts';
import { remotion } from '../lib/proc.ts';
import { compId, withRenderEntry } from '../lib/root.ts';
import { loadScenario } from '../lib/scenario.ts';
import { readState } from '../lib/state.ts';

// Default still of scene `i`: its middle, or later when typing/terminal/count-ups finish after the middle,
// so the PNG shows the final text. Never inside the outgoing transition.
export const qaFrame = (sc: Scenario, i: number, frames: number): number => {
	const lastClean = frames - transitionFrames(sc, i) - 1;
	return Math.max(0, Math.min(Math.max(Math.floor(frames / 2), settleFrame(sc.scenes[i], sc.fps) + 10), lastClean));
};

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const slug = assertSlug(_[0]);
	readState(slug);
	const sc = loadScenario(slug);
	const total = totalFrames(sc);
	const timeline = sceneTimeline(sc);

	let frames: number[];
	const list = str(flags, 'frames');
	const every = num(flags, 'every');
	if (list) {
		frames = list.split(',').map((f) => Number(f.trim()));
		if (frames.some((f) => !Number.isInteger(f) || f < 0 || f >= total)) fail(`--frames must be integers in 0..${total - 1}`, `nolan stills ${slug} --frames 0,45,90`);
	} else if (every !== undefined) {
		if (every <= 0) fail('--every must be > 0 seconds', `nolan stills ${slug} --every 2`);
		const step = Math.max(1, Math.round(every * sc.fps));
		frames = Array.from({ length: Math.ceil(total / step) }, (_x, i) => i * step);
	} else frames = timeline.map((t, i) => t.from + qaFrame(sc, i, t.frames));
	frames = [...new Set(frames)].sort((a, b) => a - b);

	const dir = join(projectDir(slug), 'stills');
	const tmp = join(CACHE_DIR, `stills-${slug}`);
	rmSync(dir, { recursive: true, force: true });
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	mkdirSync(tmp, { recursive: true });
	const propsFile = join(CACHE_DIR, `props-${slug}.json`);
	writeFileSync(propsFile, JSON.stringify(sc));

	info(`rendering ${frames.length} still(s)…`);
	await withRenderEntry(slug, sc, async (entry) => {
		const r = await remotion(['render', entry, compId(slug), tmp, '--sequence', '--image-format=png', `--frames=${frames.join(',')}`, `--props=${propsFile}`, '--log=error'], { capture: true });
		if (r.code !== 0) fail(`remotion render failed:\n${(r.stderr || r.stdout).trim().split('\n').slice(-12).join('\n')}`, `nolan validate ${slug}`);
	});

	// Remotion names sequence files by frame number (element-0045.png); map them back to scenes.
	const pngs = readdirSync(tmp).filter((f) => f.endsWith('.png'));
	const out: string[] = [];
	for (const f of pngs) {
		const frame = Number(/(\d+)\.png$/.exec(f)?.[1]);
		const i = timeline.findLastIndex((t) => t.from <= frame);
		const name = `f${String(frame).padStart(5, '0')}-${String(i + 1).padStart(2, '0')}-${timeline[i]?.id ?? 'x'}.png`;
		renameSync(join(tmp, f), join(dir, name));
		out.push(name);
	}
	rmSync(tmp, { recursive: true, force: true });
	if (!out.length) fail('Remotion produced no PNG', `NOLAN_DEBUG=1 nolan stills ${slug}`);
	ok(`${out.length} PNG(s) in ${relative(ROOT, dir)}/ (frame-sceneIndex-sceneId)`);
	for (const f of out.sort()) info(`  ${relative(ROOT, join(dir, f))}  (${(Number(f.slice(1, 6)) / sc.fps).toFixed(2)}s)`);
	info('todo: open every PNG yourself; check overflow, contrast, safe margins, empty scenes before showing the user');
	next(`fix scenario.json and rerun nolan stills ${slug}  |  nolan render ${slug} --draft`);
};

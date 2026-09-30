// `nolan render <slug> [--draft] [--out FILE]`: sync, validate, snapshot, render mp4 + thumbnail, print credits.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { sceneTimeline, totalFrames } from '../../src/lib/timing.ts';
import { parseArgs, str } from '../lib/args.ts';
import { probeDuration } from '../lib/ffmpeg.ts';
import { readLock } from '../lib/lock.ts';
import { fail, info, next, ok, warn } from '../lib/log.ts';
import { assertSlug, projectDir, ROOT } from '../lib/paths.ts';
import { remotion } from '../lib/proc.ts';
import { compId, readBase, readRoot, rootSlugs, withRenderEntry } from '../lib/root.ts';
import { loadScenario } from '../lib/scenario.ts';
import { readState } from '../lib/state.ts';
import { snapshot, versionPath, vName } from '../lib/versions.ts';
import { syncProject } from './sync.ts';
import { ccCredits, scenarioWarnings } from './validate.ts';

export const renderFile = (slug: string, version: number, draft: boolean): string =>
	join(projectDir(slug), 'renders', `${slug}-${vName(version)}${draft ? '-draft' : ''}.mp4`);

const tail = (s: string): string => s.trim().split('\n').slice(-12).join('\n');

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args, ['draft']);
	const slug = assertSlug(_[0]);
	const state = readState(slug);
	const draft = !!flags.draft;

	// No base = Studio was never opened from this checkout: Root holds nothing to pull (see syncProject).
	if (rootSlugs(readRoot()).includes(slug) && readBase(slug) !== undefined) syncProject(slug);
	const sc = loadScenario(slug);
	for (const w of scenarioWarnings(sc)) warn(w);
	const cc = ccCredits(slug);
	if (!draft && cc.length && !sc.scenes.some((s) => s.type === 'outro'))
		fail(`no outro scene: CC BY assets (${cc.join(', ')}) must be credited in the video`, `add an outro scene last in scenario.json (or nolan render ${slug} --draft)`);
	const { version, created } = snapshot(slug, draft ? 'draft render' : 'render');
	info(`${created ? 'snapshot' : 'unchanged since'} ${vName(version)}`);

	const file = renderFile(slug, version, draft);
	const thumb = file.replace(/\.mp4$/, '.jpg');
	mkdirSync(dirname(file), { recursive: true });
	const props = `--props=${versionPath(slug, version)}`;
	const quality = draft ? ['--scale=0.5', '--crf=28'] : [];
	const id = compId(slug);
	const seconds = totalFrames(sc) / sc.fps;
	info(`rendering ${id} (${seconds.toFixed(1)}s, ${draft ? 'draft 50%' : 'full quality'}) — usually 1-3x the video length…`);

	await withRenderEntry(slug, sc, async (entry) => {
		const r = await remotion(['render', entry, id, file, props, ...quality, '--log=error'], { capture: true });
		if (r.code !== 0) fail(`remotion render failed:\n${tail(r.stderr || r.stdout)}`, `nolan validate ${slug}; NOLAN_DEBUG=1 for details; first render needs network for headless Chrome (nolan doctor)`);
		const tl = sceneTimeline(sc);
		const first = tl.find((_t, i) => sc.scenes[i].type === 'title') ?? tl[0];
		const s = await remotion(['still', entry, id, thumb, props, `--frame=${first.from + Math.floor(first.frames / 2)}`, '--image-format=jpeg', ...(draft ? ['--scale=0.5'] : []), '--log=error'], { capture: true });
		if (s.code !== 0) warn(`thumbnail failed: ${tail(s.stderr || s.stdout)}`);
	});

	const mb = (statSync(file).size / 1024 / 1024).toFixed(1);
	const dur = await probeDuration(file).catch(() => NaN);
	ok(`${relative(ROOT, file)} (${mb} MB, ${dur.toFixed(2)}s, ${sc.format}${draft ? ', draft' : ''})`);
	if (existsSync(thumb)) info(`thumbnail: ${relative(ROOT, thumb)}`);
	const out = str(flags, 'out');
	if (out) {
		mkdirSync(dirname(resolve(out)), { recursive: true });
		copyFileSync(file, resolve(out));
		info(`copied to ${resolve(out)}`);
	}

	const lock = readLock(slug);
	if (lock.length) {
		info('CREDITS (keep with the video, required for CC BY):');
		for (const e of lock) info(`  ${e.kind}: ${e.attribution || `"${e.title}" by ${e.creator} (${e.license})`}${e.sourceUrl ? ` — ${e.sourceUrl}` : ''}`);
	} else info('credits: none (no third-party assets in assets.lock.json)');

	if (draft) return next(`look at it, then nolan render ${slug}  (full quality)  |  nolan stills ${slug}`);
	info(`todo: show ${relative(ROOT, file)} to the user and ask for approval`);
	next(state.stage === 'approved' ? `nolan reopen ${slug}` : `nolan approve ${slug}`);
};

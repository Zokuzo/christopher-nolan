import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { totalFrames } from '../../src/lib/timing.ts';
import type { CommandContext } from '../nolan.ts';
import { parseArgs } from '../lib/args.ts';
import { json, info, next } from '../lib/log.ts';
import { assertSlug, projectDir } from '../lib/paths.ts';
import { scenarioPath, validateScenario } from '../lib/scenario.ts';
import { listProjects, nextAction, readState, type State } from '../lib/state.ts';
import { vName } from '../lib/versions.ts';
import { studioRunning } from './studio.ts';

const scenarioSummary = (slug: string): { ok: boolean; text: string } => {
	const file = scenarioPath(slug);
	if (!existsSync(file)) return { ok: false, text: 'missing' };
	let data: unknown;
	try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { return { ok: false, text: 'invalid JSON' }; }
	const r = validateScenario(data);
	if (!r.ok) return { ok: false, text: `invalid (nolan validate ${slug})` };
	const s = r.scenario;
	return { ok: true, text: `${s.scenes.length} scenes, ${(totalFrames(s) / s.fps).toFixed(1)}s, ${s.format} @${s.fps}fps, theme ${s.theme.preset}` };
};

const renders = (slug: string): string[] => {
	const dir = join(projectDir(slug), 'renders');
	return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort() : [];
};

const describe = async (state: State) => {
	const { todo, next: nextCmd } = nextAction(state);
	const studio = await studioRunning(state.slug);
	return {
		slug: state.slug,
		stage: state.stage,
		version: state.version ? vName(state.version) : null,
		approved: state.approved ?? null,
		repo: state.repo ?? null,
		scenario: scenarioSummary(state.slug).text,
		studio: studio ? `http://localhost:${studio.port}` : null,
		renders: renders(state.slug),
		updatedAt: state.updatedAt,
		todo,
		next: nextCmd,
	};
};

export const run = async (args: string[], ctx: CommandContext): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const slug = ctx.cmd === 'list' ? undefined : _[0];

	if (!slug) {
		const all = await Promise.all(listProjects().map((s) => describe(readState(s))));
		if (flags.json) return json(all);
		if (!all.length) {
			info('no projects yet');
			return next('nolan new <slug> [--title T] [--repo PATH]');
		}
		const w = Math.max(...all.map((p) => p.slug.length));
		for (const p of all) info(`${p.slug.padEnd(w)}  ${p.stage.padEnd(11)} ${(p.version ?? '-').padEnd(5)} next: ${p.next}`);
		return next(`nolan status <slug>   (${all.length} project${all.length > 1 ? 's' : ''})`);
	}

	const d = await describe(readState(assertSlug(slug)));
	if (flags.json) return json(d);
	info(`project: ${d.slug}`);
	info(`stage: ${d.stage}${d.version ? `  (scenario ${d.version})` : ''}${d.approved ? `  approved ${vName(d.approved.version)} → ${d.approved.file}` : ''}`);
	if (d.repo) info(`repo: ${d.repo}`);
	info(`scenario: ${d.scenario}`);
	if (d.studio) info(`studio: running at ${d.studio}`);
	if (d.renders.length) info(`renders: ${d.renders.slice(-3).join(', ')}`);
	info(`todo: ${d.todo}`);
	next(d.next);
};

// `nolan studio <slug> [--port N] [--force] | --stop`: regenerate src/Root.tsx for the slug, run Remotion Studio detached.
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { genRoot } from '../../src/lib/root-gen.ts';
import { num, parseArgs } from '../lib/args.ts';
import { readConfig } from '../lib/config.ts';
import { fail, info, next, ok, warn } from '../lib/log.ts';
import { assertSlug, projectDir, REMOTION_BIN, ROOT } from '../lib/paths.ts';
import { compId, readBase, readRoot, ROOT_TSX, rootProps, rootSlugs, writeBase } from '../lib/root.ts';
import { loadScenario, validateScenario } from '../lib/scenario.ts';
import { listProjects, readState, setStage, STAGES } from '../lib/state.ts';

type StudioInfo = { pid: number; port: number; startedAt: string };

const pidFile = (slug: string): string => join(projectDir(slug), '.studio.pid');
const logFile = (slug: string): string => join(projectDir(slug), 'studio.log');

const alive = (pid: number): boolean => {
	try { process.kill(pid, 0); return true; }
	catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
};

const answers = async (port: number): Promise<boolean> => {
	try { return (await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(2000) })).ok; }
	catch { return false; }
};

// Running Studio recorded for this slug. A pid only counts while its recorded port answers too:
// pid files survive reboots and pids get reused, and we must never signal an unrelated process.
// Anything else is stale: the pid file is removed and nothing is killed.
export const studioRunning = async (slug: string): Promise<StudioInfo | null> => {
	const file = pidFile(slug);
	if (!existsSync(file)) return null;
	try {
		const s = JSON.parse(readFileSync(file, 'utf8')) as StudioInfo;
		if (alive(s.pid) && await answers(s.port)) return s;
	} catch { /* corrupt pid file */ }
	rmSync(file, { force: true });
	return null;
};

const kill = (pid: number, hard = false): void => {
	if (process.platform === 'win32') { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); return; }
	try { process.kill(-pid, hard ? 'SIGKILL' : 'SIGTERM'); } // detached → own process group
	catch { try { process.kill(pid, hard ? 'SIGKILL' : 'SIGTERM'); } catch { /* already gone */ } }
};

// Studio has edits that were never synced into scenario.json (Root literal ≠ what we last wrote).
const unsynced = (slug: string, src: string): boolean => {
	const base = readBase(slug);
	if (base === undefined) return false;
	let props: unknown;
	try { props = rootProps(slug, src); } catch { return true; }
	if (props === undefined) return false;
	const v = validateScenario(props);
	const b = validateScenario(base);
	return !v.ok || !b.ok || !isDeepStrictEqual(JSON.parse(JSON.stringify(v.scenario)), JSON.parse(JSON.stringify(b.scenario)));
};

const stop = async (slug: string): Promise<void> => {
	const s = await studioRunning(slug);
	if (!s) {
		ok(`no Studio running for ${slug}`);
		return next(`nolan studio ${slug}`);
	}
	kill(s.pid);
	for (let i = 0; i < 20 && alive(s.pid); i++) await new Promise((r) => setTimeout(r, 250));
	if (alive(s.pid)) kill(s.pid, true);
	rmSync(pidFile(slug), { force: true });
	ok(`stopped Studio for ${slug} (pid ${s.pid}, port ${s.port})`);
	if (unsynced(slug, readRoot())) return next(`nolan sync ${slug}  (Studio edits not synced yet)`);
	next(`nolan render ${slug}`);
};

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args, ['stop', 'force']);
	const slug = assertSlug(_[0]);
	const state = readState(slug);
	if (flags.stop) return stop(slug);

	const scenario = loadScenario(slug);
	const src = readRoot();
	for (const s of rootSlugs(src)) {
		if (!listProjects().includes(s) || (s === slug && flags.force)) continue;
		if (unsynced(s, src)) fail(`src/Root.tsx holds Studio edits for "${s}" that are not in its scenario.json`,
			s === slug ? `keep them: nolan sync ${slug} | discard them: nolan studio ${slug} --force` : `nolan sync ${s}, then nolan studio ${slug}`);
	}
	const plainScenario = JSON.parse(JSON.stringify(scenario)) as object;
	const code = genRoot([{ slug, compId: compId(slug), scenario: plainScenario }]);
	if (code !== src) writeFileSync(ROOT_TSX, code);
	writeBase(slug, plainScenario);

	// One Studio serves src/Root.tsx whatever slug started it: reuse any running one.
	let running = await studioRunning(slug);
	if (!running) for (const p of listProjects()) {
		if (p === slug || !(await studioRunning(p))) continue;
		renameSync(pidFile(p), pidFile(slug));
		running = await studioRunning(slug);
		break;
	}
	if (running) {
		ok(`Studio already running (pid ${running.pid}); src/Root.tsx now shows "${slug}" (hot reload)`);
		if (num(flags, 'port') && num(flags, 'port') !== running.port) warn(`--port ignored: stop it first (nolan studio ${slug} --stop)`);
		return done(slug, running.port, state.stage);
	}

	const port = num(flags, 'port') ?? readConfig().studioPort;
	if (await answers(port)) fail(`port ${port} is already used by another program`, `nolan studio ${slug} --port ${port + 1}`);

	const out = openSync(logFile(slug), 'w');
	const child = spawn(process.execPath, [REMOTION_BIN, 'studio', 'src/index.ts', '--port', String(port), '--no-open'], {
		cwd: ROOT, detached: true, stdio: ['ignore', out, out], windowsHide: true,
	});
	closeSync(out);
	child.unref();
	const pid = child.pid;
	if (!pid) return fail('could not start Remotion Studio', 'nolan doctor');
	writeFileSync(pidFile(slug), JSON.stringify({ pid, port, startedAt: new Date().toISOString() } satisfies StudioInfo) + '\n');

	const deadline = Date.now() + 60_000;
	while (!(await answers(port))) {
		if (!alive(pid) || Date.now() > deadline) {
			kill(pid, true);
			rmSync(pidFile(slug), { force: true });
			const tail = readFileSync(logFile(slug), 'utf8').trim().split('\n').slice(-8).join('\n');
			return fail(`Remotion Studio did not come up on port ${port}${tail ? `:\n${tail}` : ''}`, `read projects/${slug}/studio.log, or try --port ${port + 1}`);
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	ok(`Studio started (pid ${pid}, log projects/${slug}/studio.log)`);
	warn(`Studio listens on all network interfaces (port ${port}); use a trusted network and stop it when done`);
	done(slug, port, state.stage);
};

const done = (slug: string, port: number, stage: string): void => {
	const i = STAGES.indexOf(stage as (typeof STAGES)[number]);
	if (i >= STAGES.indexOf('scenario') && i < STAGES.indexOf('preview')) setStage(readState(slug), 'preview', 'studio opened');
	info(`url: http://localhost:${port}/${slug}`);
	info('user: edit scene text/timing/theme in the right-hand Props panel, then click 💾 to save into src/Root.tsx');
	info('agent: timeline drags are not persisted for data-driven scenes; only Props-panel edits are');
	next(`nolan sync ${slug}  (after the user saved)  |  nolan stills ${slug}  |  nolan studio ${slug} --stop`);
};

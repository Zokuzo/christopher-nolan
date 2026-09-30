import { spawnSync } from 'node:child_process';
import { REMOTION_BIN } from './paths.ts';
import { run, type RunOptions, type RunResult } from './proc.ts';

type Tool = 'ffmpeg' | 'ffprobe';
export type Resolved = { cmd: string; prefix: string[]; source: 'system' | 'remotion' };

const cache = new Map<Tool, Resolved>();

// System binary on PATH first; else Remotion's bundled one (`remotion ffmpeg|ffprobe`).
// The bundled ffmpeg lacks afade/ebur128/lavfi (docs/research/critic.md): do fades in Remotion.
export const resolveTool = (tool: Tool): Resolved => {
	let r = cache.get(tool);
	if (!r) {
		const sys = spawnSync(tool, ['-version'], { stdio: 'ignore', windowsHide: true });
		r = sys.status === 0
			? { cmd: tool, prefix: [], source: 'system' }
			: { cmd: process.execPath, prefix: [REMOTION_BIN, tool], source: 'remotion' };
		cache.set(tool, r);
	}
	return r;
};

export const ffmpeg = (args: string[], opts: RunOptions = { capture: true }): Promise<RunResult> => {
	const t = resolveTool('ffmpeg');
	return run(t.cmd, [...t.prefix, ...args], opts);
};

export const ffprobe = (args: string[], opts: RunOptions = { capture: true }): Promise<RunResult> => {
	const t = resolveTool('ffprobe');
	return run(t.cmd, [...t.prefix, ...args], opts);
};

// Media duration in seconds; throws if the file cannot be probed.
export const probeDuration = async (file: string): Promise<number> => {
	const r = await ffprobe(['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
	const d = parseFloat(r.stdout.trim());
	if (r.code !== 0 || !Number.isFinite(d)) throw new Error(`ffprobe could not read duration of ${file}: ${r.stderr.trim().split('\n').pop() ?? ''}`);
	return d;
};

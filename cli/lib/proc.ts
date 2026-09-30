import { spawn } from 'node:child_process';
import { REMOTION_BIN, ROOT } from './paths.ts';

export type RunOptions = { cwd?: string; capture?: boolean; env?: NodeJS.ProcessEnv; input?: string };
export type RunResult = { code: number; stdout: string; stderr: string };

// Never throws on a non-zero exit: check `code`. Rejects only if the binary cannot be spawned (ENOENT).
// capture=false inherits stdio (live progress for render/studio); capture=true buffers output.
export const run = (cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> =>
	new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			cwd: opts.cwd ?? ROOT,
			env: opts.env ?? process.env,
			stdio: opts.capture ? ['pipe', 'pipe', 'pipe'] : [opts.input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
			windowsHide: true,
		});
		let stdout = '';
		let stderr = '';
		child.stdout?.on('data', (d) => (stdout += d));
		child.stderr?.on('data', (d) => (stderr += d));
		child.on('error', reject);
		child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
		if (child.stdin) child.stdin.end(opts.input ?? '');
	});

// `npx remotion <args>` without npx: runs the local @remotion/cli with the current node (cross-platform, no shell).
export const remotion = (args: string[], opts: RunOptions = {}): Promise<RunResult> =>
	run(process.execPath, [REMOTION_BIN, ...args], opts);

// `nolan doctor [--json]`: is this machine ready? Hard failures exit 1; optional features only warn.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLedger, spentUsd, usd } from '../ai/ledger.ts';
import { parseArgs } from '../lib/args.ts';
import { readConfig, loadEnv } from '../lib/config.ts';
import { resolveTool } from '../lib/ffmpeg.ts';
import { info, json, next } from '../lib/log.ts';
import { configDir, PUBLIC_DIR, ROOT } from '../lib/paths.ts';

type Check = { name: string; status: 'ok' | 'warn' | 'fail'; detail: string; fix?: string };

const nodeOk = (v: string): boolean => {
	const [maj, min] = v.slice(1).split('.').map(Number);
	return maj > 22 || (maj === 22 && min >= 18);
};

const deps = (): Check => {
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
	const wanted = { ...pkg.dependencies, ...pkg.devDependencies };
	const bad = Object.entries(wanted).filter(([name, v]) => {
		const f = join(ROOT, 'node_modules', name, 'package.json');
		return !existsSync(f) || (JSON.parse(readFileSync(f, 'utf8')) as { version: string }).version !== v;
	}).map(([n]) => n);
	return bad.length
		? { name: 'deps', status: 'fail', detail: `missing or wrong version: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ', …' : ''}`, fix: 'npm install' }
		: { name: 'deps', status: 'ok', detail: `${Object.keys(wanted).length} packages, remotion ${wanted.remotion}` };
};

const openverse = async (): Promise<Check> => {
	try {
		const r = await fetch('https://api.openverse.org/v1/audio/?q=whoosh&page_size=1', {
			headers: { 'User-Agent': 'christopher-nolan/0.1 (+https://github.com/Zokuzo/christopher-nolan)' },
			signal: AbortSignal.timeout(8000),
		});
		return r.ok ? { name: 'openverse', status: 'ok', detail: 'api.openverse.org reachable' }
			: { name: 'openverse', status: 'warn', detail: `HTTP ${r.status}`, fix: 'music falls back to ccMixter / bundled bed' };
	} catch (e) {
		return { name: 'openverse', status: 'warn', detail: `unreachable (${(e as Error).message})`, fix: 'offline: music falls back to the bundled bed' };
	}
};

export const run = async (args: string[]): Promise<void> => {
	const { flags } = parseArgs(args);
	const checks: Check[] = [];
	const v = process.versions.node;
	checks.push(nodeOk(`v${v}`) ? { name: 'node', status: 'ok', detail: v } : { name: 'node', status: 'fail', detail: `${v} (needs >= 22.18 for TypeScript type-stripping)`, fix: 'install Node 22.18+ (nvm install 22)' });
	checks.push(existsSync(join(ROOT, 'node_modules')) ? deps() : { name: 'deps', status: 'fail', detail: 'node_modules missing', fix: 'npm install' });

	for (const tool of ['ffmpeg', 'ffprobe'] as const) {
		const t = resolveTool(tool);
		checks.push({ name: tool, status: 'ok', detail: t.source === 'system' ? 'system binary on PATH' : 'Remotion bundled (no afade/ebur128; fine for nolan)' });
	}
	const chrome = join(ROOT, 'node_modules', '.remotion', 'chrome-headless-shell');
	checks.push(existsSync(chrome) ? { name: 'chrome', status: 'ok', detail: 'headless shell installed' }
		: { name: 'chrome', status: 'warn', detail: 'headless shell not downloaded yet (first render downloads it)', fix: 'nolan setup' });
	checks.push(existsSync(join(PUBLIC_DIR, 'sfx', 'index.json')) ? { name: 'sfx', status: 'ok', detail: 'public/sfx/index.json present' }
		: { name: 'sfx', status: 'warn', detail: 'sound effects not vendored', fix: 'nolan setup' });
	checks.push(await openverse());

	const cfg = readConfig();
	const spent = spentUsd(readLedger());
	const key = loadEnv().OPENROUTER_API_KEY;
	checks.push(key
		? { name: 'openrouter', status: 'ok', detail: `key set; budget ${usd(cfg.budgetUsd)}, spent ${usd(spent)}, remaining ${usd(Math.max(0, cfg.budgetUsd - spent))}` }
		: { name: 'openrouter', status: 'ok', detail: 'no key (optional: voice-over, AI images, critique → nolan config set-key)' });
	checks.push({ name: 'config', status: 'ok', detail: existsSync(configDir()) ? configDir() : `${configDir()} (not created yet, defaults in use)` });

	const failed = checks.filter((c) => c.status === 'fail');
	if (flags.json) json({ ok: !failed.length, checks });
	else {
		for (const c of checks) info(`${c.status.padEnd(4)}  ${c.name.padEnd(10)} ${c.detail}${c.fix && c.status !== 'ok' ? `  → ${c.fix}` : ''}`);
		if (!failed.length) next(checks.some((c) => c.fix === 'nolan setup') ? 'nolan setup' : 'nolan status');
	}
	if (failed.length) {
		if (!flags.json) { console.error(`error: ${failed.length} blocking problem(s)`); console.error(`fix: ${failed.map((c) => c.fix).join(' && ')}`); }
		process.exit(1);
	}
};

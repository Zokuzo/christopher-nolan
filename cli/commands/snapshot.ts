// snapshot <slug> [--note N] | versions <slug> [--json] | restore <slug> <vNNN>
import type { CommandContext } from '../nolan.ts';
import { parseArgs, str } from '../lib/args.ts';
import { fail, info, json, next, ok, warn } from '../lib/log.ts';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertSlug, projectDir } from '../lib/paths.ts';
import { saveScenario, scenarioPath, tryLoadScenario } from '../lib/scenario.ts';
import { readState } from '../lib/state.ts';
import { listVersions, matchesVersion, parseVName, readVersion, snapshot, versionsDir, vName } from '../lib/versions.ts';

export const run = async (args: string[], ctx: CommandContext): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const slug = assertSlug(_[0]);
	readState(slug); // exits if the project does not exist

	if (ctx.cmd === 'snapshot') {
		const r = snapshot(slug, str(flags, 'note'), true);
		ok(`saved projects/${slug}/versions/${vName(r.version)}.json`);
		return next(`nolan versions ${slug}`);
	}

	const versions = listVersions(slug);
	if (ctx.cmd === 'versions') {
		const rows = versions.map((n) => ({ ...readVersion(slug, n).meta, name: vName(n) }));
		if (flags.json) return json(rows);
		if (!rows.length) {
			info('no versions yet');
			return next(`nolan snapshot ${slug} --note "first draft"`);
		}
		const current = versions.find((n) => matchesVersion(slug, n));
		for (const r of rows) info(`${r.name}  ${r.at.slice(0, 19).replace('T', ' ')}  ${r.note ?? ''}${r.version === current ? '  ← scenario.json' : ''}`);
		if (!tryLoadScenario(slug)) info(`scenario.json is invalid (nolan validate ${slug}); restore a version to recover`);
		else if (current === undefined) info('scenario.json has unsaved changes (not in any version)');
		return next(`nolan restore ${slug} <vNNN>`);
	}

	// restore
	const n = parseVName(_[1]);
	if (n === undefined || !versions.includes(n)) fail(`unknown version "${_[1] ?? ''}"`, `nolan versions ${slug}`);
	// A broken scenario.json cannot be snapshotted: keep its raw bytes instead, so a rollback always works.
	let kept: string;
	if (tryLoadScenario(slug)) kept = vName(snapshot(slug, `before restore of ${vName(n!)}`).version);
	else if (existsSync(scenarioPath(slug))) {
		kept = `versions/invalid-${Date.now()}.json`;
		mkdirSync(versionsDir(slug), { recursive: true });
		copyFileSync(scenarioPath(slug), join(projectDir(slug), kept));
		warn(`scenario.json was invalid; its raw content is kept as projects/${slug}/${kept}`);
	} else kept = 'nothing (no scenario.json)';
	saveScenario(slug, readVersion(slug, n!).scenario);
	ok(`restored ${vName(n!)} into scenario.json (previous state kept as ${kept})`);
	info('studio: if it is running, regenerate its Root so it shows the restored props');
	next(`nolan studio ${slug}  (or nolan validate ${slug})`);
};

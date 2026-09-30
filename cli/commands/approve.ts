// approve <slug>: the full render of the current scenario version becomes the deliverable. reopen <slug>: back to scenario.
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import type { CommandContext } from '../nolan.ts';
import { parseArgs, str } from '../lib/args.ts';
import { fail, info, next, ok } from '../lib/log.ts';
import { assertSlug, ROOT } from '../lib/paths.ts';
import { readState, setStage } from '../lib/state.ts';
import { listVersions, matchesVersion, vName } from '../lib/versions.ts';
import { renderFile } from './render.ts';

export const run = async (args: string[], ctx: CommandContext): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const slug = assertSlug(_[0]);
	const state = readState(slug);

	if (ctx.cmd === 'reopen') {
		if (state.stage !== 'approved') info(`note: ${slug} was not approved (stage ${state.stage})`);
		state.approved = undefined;
		setStage(state, 'scenario', str(flags, 'note') ?? 'reopened');
		ok(`${slug} reopened at stage scenario`);
		return next(`edit projects/${slug}/scenario.json, then nolan validate ${slug}`);
	}

	const version = listVersions(slug).findLast((n) => matchesVersion(slug, n));
	if (version === undefined) fail('scenario.json changed since the last render', `nolan render ${slug}`);
	const file = renderFile(slug, version!, false);
	if (!existsSync(file)) {
		const draft = existsSync(renderFile(slug, version!, true));
		fail(`no full-quality render of ${vName(version!)}${draft ? ' (only a draft)' : ''}`, `nolan render ${slug}`);
	}
	const rel = relative(ROOT, file).split('\\').join('/');
	state.approved = { version: version!, file: rel, at: new Date().toISOString() };
	setStage(state, 'approved', str(flags, 'note') ?? `approved ${vName(version!)}`);
	ok(`${slug} approved: ${rel}`);
	next(`share ${rel}  |  later changes: nolan reopen ${slug}`);
};

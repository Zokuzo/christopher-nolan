import { parseArgs, str } from '../lib/args.ts';
import { fail, info, next, ok } from '../lib/log.ts';
import { assertSlug } from '../lib/paths.ts';
import { isStage, nextAction, readState, setStage, STAGES } from '../lib/state.ts';

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const [slugArg, stage] = _;
	if (!slugArg || !stage) fail('usage: nolan stage <slug> <stage> [--note N]', `stages: ${STAGES.join(' → ')}`);
	const slug = assertSlug(slugArg);
	if (!isStage(stage)) return fail(`unknown stage "${stage}"`, `use one of: ${STAGES.join(', ')}`);
	if (stage === 'approved') fail('approval needs a full render', `nolan render ${slug}, then nolan approve ${slug}`);
	const state = readState(slug);
	const from = state.stage;
	if (from === 'approved') state.approved = undefined; // leaving approved = reopening
	setStage(state, stage, str(flags, 'note'));
	ok(`${slug}: ${from} → ${stage}`);
	const a = nextAction(state);
	info(`todo: ${a.todo}`);
	next(a.next);
};

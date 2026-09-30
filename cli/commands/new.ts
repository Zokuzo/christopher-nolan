import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FORMATS, THEME_PRESETS, type Format, type ThemePreset } from '../../src/schema.ts';
import { parseArgs, str } from '../lib/args.ts';
import { readConfig } from '../lib/config.ts';
import { fail, info, next, ok } from '../lib/log.ts';
import { assertSlug, projectDir } from '../lib/paths.ts';
import { saveScenario } from '../lib/scenario.ts';
import { createState, statePath } from '../lib/state.ts';

const BRIEF = (title: string, repo?: string): string => `# ${title}

## Idea
<!-- One or two sentences: what is this video about? -->

## Audience
<!-- Who watches it, where (X/LinkedIn/YouTube/README), what they already know. -->

## Goal
<!-- What the viewer should feel/do after watching (star the repo, try the CLI, ...). -->

## Subject
${repo ? `Repository: ${repo}` : '<!-- Existing repo (path/URL) or a pure idea. -->'}

## Constraints
<!-- Length, format (16:9 / 9:16 / 1:1), language, voice-over or not, tone, must-show items. -->
`;

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const usage = `nolan new my-video [--title "My video"] [--repo PATH] [--format ${FORMATS.join('|')}]`;
	if (!_[0]) fail('missing <slug>', usage);
	const slug = (() => { try { return assertSlug(_[0]); } catch (e) { return fail((e as Error).message, usage); } })();
	if (existsSync(statePath(slug))) fail(`project "${slug}" already exists`, `nolan status ${slug}`);

	const format = (str(flags, 'format') ?? '16:9') as Format;
	if (!FORMATS.includes(format)) fail(`unknown format "${format}"`, `use one of: ${FORMATS.join(', ')}`);
	const repoFlag = str(flags, 'repo');
	const repo = repoFlag ? resolve(repoFlag) : undefined;
	if (repo && !(existsSync(repo) && statSync(repo).isDirectory())) fail(`--repo ${repoFlag} is not a directory`, 'clone URLs first (git clone URL /tmp/x), then pass the local path');
	const title = str(flags, 'title') ?? slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
	const saved = readConfig().defaultTheme as ThemePreset;
	const preset = THEME_PRESETS.includes(saved) ? saved : 'interstellar';

	createState(slug, repo);
	writeFileSync(join(projectDir(slug), 'brief.md'), BRIEF(title, repo));
	saveScenario(slug, {
		slug, title, format,
		theme: { preset },
		audio: { voice: { enabled: false, volume: 1 } }, // no voice until `ai tts` makes one (it switches this on)
		scenes: [
			{ id: 'title', type: 'title', seconds: 3.5, title, subtitle: 'Replace me in scenario.json' },
			{ id: 'points', type: 'bullets', seconds: format === '9:16' ? 4 : 5, title: 'What it does', bullets: ['First point', 'Second point', 'Third point'] },
			{ id: 'outro', type: 'outro', seconds: 4, title, cta: 'Try it today' },
		],
	});
	ok(`created projects/${slug}/ (state.json, brief.md, scenario.json: 3 scenes, ${format}, ${preset})`);
	if (repo) info(`repo: ${repo}`);
	info('stage: brief — interview the user one question at a time, fill brief.md');
	next(repo ? `nolan scan ${slug}` : `nolan status ${slug}`);
};

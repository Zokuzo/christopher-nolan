import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSlug, PROJECTS_DIR, projectDir } from './paths.ts';
import { fail } from './log.ts';

export const STAGES = ['brief', 'scan', 'grill', 'inspiration', 'scenario', 'assets', 'preview', 'approved'] as const;
export type Stage = (typeof STAGES)[number];

export type State = {
	slug: string;
	stage: Stage;
	createdAt: string;
	updatedAt: string;
	repo?: string;
	version: number; // last snapshot number (0 = none yet)
	approved?: { version: number; file: string; at: string };
	history: { at: string; stage: Stage; note?: string }[];
};

export const isStage = (s: string | undefined): s is Stage => STAGES.includes(s as Stage);
export const statePath = (slug: string): string => join(projectDir(slug), 'state.json');

// Dirs that are not valid slugs (e.g. _scratch) are ignored rather than crashing every listing.
const validSlug = (d: string): boolean => { try { assertSlug(d); return true; } catch { return false; } };

export const listProjects = (): string[] =>
	existsSync(PROJECTS_DIR)
		? readdirSync(PROJECTS_DIR).filter((d) => validSlug(d) && existsSync(join(PROJECTS_DIR, d, 'state.json'))).sort()
		: [];

export const readState = (slug: string): State => {
	const file = statePath(slug);
	if (!existsSync(file)) return fail(`no project "${slug}"`, `nolan new ${slug}  (or nolan list)`);
	return JSON.parse(readFileSync(file, 'utf8')) as State;
};

export const writeState = (state: State): State => {
	state.updatedAt = new Date().toISOString();
	mkdirSync(projectDir(state.slug), { recursive: true });
	writeFileSync(statePath(state.slug), JSON.stringify(state, null, 2) + '\n');
	return state;
};

export const createState = (slug: string, repo?: string): State => {
	const at = new Date().toISOString();
	return writeState({ slug, stage: 'brief', createdAt: at, updatedAt: at, ...(repo ? { repo } : {}), version: 0, history: [{ at, stage: 'brief', note: 'created' }] });
};

// Stage = the step currently in progress. Mutates, records history, persists.
export const setStage = (state: State, stage: Stage, note?: string): State => {
	state.stage = stage;
	state.history.push({ at: new Date().toISOString(), stage, ...(note ? { note } : {}) });
	return writeState(state);
};

// What the agent should do at this stage, and the command that follows.
export const nextAction = (state: State): { todo: string; next: string } => {
	const s = state.slug;
	switch (state.stage) {
		case 'brief': return {
			todo: `Interview the user (one question at a time) and write projects/${s}/brief.md.`,
			next: state.repo ? `nolan scan ${s}` : `nolan scan ${s} <repo-path>  (no repo: nolan stage ${s} grill)`,
		};
		case 'scan': return {
			todo: `Read projects/${s}/repo-facts.json and the key files it lists; never ask the user for code facts.`,
			next: `nolan stage ${s} grill`,
		};
		case 'grill': return {
			todo: `Grill the video design one question at a time (references/grill.md), log decisions in projects/${s}/grill.md until the user confirms.`,
			next: `nolan stage ${s} inspiration  (skip: nolan stage ${s} scenario)`,
		};
		case 'inspiration': return {
			todo: `Collect references (references/inspiration.md) into projects/${s}/inspiration.json, show the user a 3-line summary.`,
			next: `nolan stage ${s} scenario`,
		};
		case 'scenario': return {
			todo: `Write projects/${s}/scenario.json (references/scenario.md), then validate it.`,
			next: `nolan validate ${s}`,
		};
		case 'assets': return {
			todo: 'Fetch music and sfx; optional voice-over/images (announce the cost first).',
			next: `nolan audio all ${s}`,
		};
		case 'preview': return {
			todo: `Render stills and read every PNG yourself first, then open the Studio and iterate with the user (Studio edits: nolan sync ${s}).`,
			next: `nolan stills ${s}  (then nolan studio ${s}  |  nolan render ${s})`,
		};
		case 'approved': return {
			todo: `Approved: ${state.approved?.file ?? '(unknown file)'}.`,
			next: `nolan reopen ${s}  (to change it)`,
		};
	}
};

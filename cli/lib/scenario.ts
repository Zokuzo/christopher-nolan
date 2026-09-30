import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ScenarioSchema, type Scenario } from '../../src/schema.ts';
import { projectDir } from './paths.ts';
import { fail } from './log.ts';

export const scenarioPath = (slug: string): string => join(projectDir(slug), 'scenario.json');

// Drop derived `_*` props (calculateMetadata output) before validating/persisting.
export const stripDerived = (data: unknown): unknown =>
	data && typeof data === 'object' && !Array.isArray(data)
		? Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_')))
		: data;

export const validateScenario = (data: unknown): { ok: true; scenario: Scenario } | { ok: false; error: string } => {
	const r = ScenarioSchema.safeParse(stripDerived(data));
	return r.success ? { ok: true, scenario: r.data } : { ok: false, error: z.prettifyError(r.error) };
};

export const loadScenario = (slug: string): Scenario => {
	const file = scenarioPath(slug);
	if (!existsSync(file)) return fail(`no scenario at projects/${slug}/scenario.json`, `write it (references/scenario.md) or nolan new ${slug}`);
	let data: unknown;
	try { data = JSON.parse(readFileSync(file, 'utf8')); }
	catch (e) { return fail(`projects/${slug}/scenario.json is not valid JSON: ${(e as Error).message}`, 'fix the JSON syntax'); }
	const r = validateScenario(data);
	if (!r.ok) return fail(`projects/${slug}/scenario.json is invalid:\n${r.error}`, `edit the listed fields, then nolan validate ${slug}`);
	return r.scenario;
};

// Like loadScenario, but undefined instead of exiting when the file is missing, not JSON or invalid.
export const tryLoadScenario = (slug: string): Scenario | undefined => {
	try {
		const r = validateScenario(JSON.parse(readFileSync(scenarioPath(slug), 'utf8')));
		return r.ok ? r.scenario : undefined;
	} catch { return undefined; }
};

// Validates (fills defaults) and writes pretty JSON. Throws on invalid input.
export const saveScenario = (slug: string, scenario: unknown): Scenario => {
	const parsed = ScenarioSchema.parse(stripDerived(scenario));
	mkdirSync(projectDir(slug), { recursive: true });
	writeFileSync(scenarioPath(slug), JSON.stringify(parsed, null, 2) + '\n');
	return parsed;
};

// Re-read scenario.json and patch it right before writing, so edits made during a long await
// (downloads, ffmpeg, paid API calls, a concurrent `nolan sync`) are kept.
export const updateScenario = (slug: string, patch: (s: Scenario) => void): Scenario => {
	const s = loadScenario(slug);
	patch(s);
	return saveScenario(slug, s);
};

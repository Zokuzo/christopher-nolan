// Scenario versions: projects/<slug>/versions/vNNN.json = the scenario plus a `_snapshot` header
// (stripped on restore like any derived `_*` prop).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Scenario } from '../../src/schema.ts';
import { projectDir } from './paths.ts';
import { loadScenario, stripDerived, tryLoadScenario } from './scenario.ts';
import { readState, writeState } from './state.ts';

export type SnapshotMeta = { version: number; note?: string; at: string };

export const vName = (n: number): string => `v${String(n).padStart(3, '0')}`;

export const parseVName = (s: string | undefined): number | undefined => {
	const m = /^v?(\d+)(?:\.json)?$/.exec(s ?? '');
	return m ? Number(m[1]) : undefined;
};

export const versionsDir = (slug: string): string => join(projectDir(slug), 'versions');
export const versionPath = (slug: string, n: number): string => join(versionsDir(slug), `${vName(n)}.json`);

// Sorted version numbers present on disk.
export const listVersions = (slug: string): number[] => {
	const dir = versionsDir(slug);
	if (!existsSync(dir)) return [];
	return readdirSync(dir).map((f) => /^v(\d+)\.json$/.exec(f)).filter((m) => m !== null).map((m) => Number(m[1])).sort((a, b) => a - b);
};

export const nextVersion = (versions: number[]): number => (versions.length ? Math.max(...versions) + 1 : 1);

export const readVersion = (slug: string, n: number): { meta: SnapshotMeta; scenario: unknown } => {
	const data = JSON.parse(readFileSync(versionPath(slug, n), 'utf8')) as Record<string, unknown>;
	return { meta: (data._snapshot as SnapshotMeta) ?? { version: n, at: '' }, scenario: stripDerived(data) };
};

// Snapshot the current scenario.json. Unchanged since the latest snapshot → reuse it (no version spam),
// unless `force`. Updates state.version.
export const snapshot = (slug: string, note?: string, force = false): { version: number; created: boolean } => {
	const current: Scenario = loadScenario(slug);
	const versions = listVersions(slug);
	const last = versions.at(-1);
	const state = readState(slug);
	if (!force && last !== undefined && isDeepStrictEqual(readVersion(slug, last).scenario, JSON.parse(JSON.stringify(current)))) {
		if (state.version !== last) writeState({ ...state, version: last });
		return { version: last, created: false };
	}
	const version = nextVersion(versions);
	const meta: SnapshotMeta = { version, ...(note ? { note } : {}), at: new Date().toISOString() };
	mkdirSync(versionsDir(slug), { recursive: true });
	writeFileSync(versionPath(slug, version), JSON.stringify({ _snapshot: meta, ...current }, null, 2) + '\n');
	writeState({ ...state, version });
	return { version, created: true };
};

// True when scenario.json equals snapshot `n` (false when scenario.json is invalid).
export const matchesVersion = (slug: string, n: number): boolean => {
	const current = tryLoadScenario(slug);
	return !!current && existsSync(versionPath(slug, n)) && isDeepStrictEqual(readVersion(slug, n).scenario, JSON.parse(JSON.stringify(current)));
};

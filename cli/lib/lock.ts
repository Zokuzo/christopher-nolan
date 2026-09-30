// public/projects/<slug>/assets.lock.json: array of every third-party/generated asset used (outro credits read it).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicProjectDir } from './paths.ts';

export type LockEntry = {
	id: string; // stable key, e.g. "music", "sfx-whoosh", "voice-intro"
	kind: 'music' | 'sfx' | 'voice' | 'image';
	file: string; // path under public/, forward slashes (staticFile-ready)
	title: string;
	creator: string;
	license: string; // human label, e.g. "CC BY 4.0"
	licenseUrl: string;
	attribution: string;
	sourceUrl: string;
	provider: string; // openverse/jamendo, ccmixter, remotion-sfx, bundled, openrouter, ...
	inputHash?: string; // ai tts: skip regeneration when model+voice+text are unchanged
};

export const lockPath = (slug: string): string => join(publicProjectDir(slug), 'assets.lock.json');

// Replace entries with the same id in place, append new ones.
export const mergeLock = (entries: LockEntry[], incoming: LockEntry[]): LockEntry[] => {
	const byId = new Map(incoming.map((e) => [e.id, e]));
	const out = entries.map((e) => byId.get(e.id) ?? e);
	for (const e of byId.values()) if (!entries.some((x) => x.id === e.id)) out.push(e);
	return out;
};

// Missing file = empty lock. A corrupt file throws (never silently overwrite credits).
export const readLock = (slug: string): LockEntry[] => {
	const file = lockPath(slug);
	if (!existsSync(file)) return [];
	const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
	if (!Array.isArray(data)) throw new Error(`${file} must be a JSON array`);
	return data as LockEntry[];
};

export const updateLock = (slug: string, incoming: LockEntry[]): LockEntry[] => {
	const merged = mergeLock(readLock(slug), incoming);
	mkdirSync(publicProjectDir(slug), { recursive: true });
	writeFileSync(lockPath(slug), JSON.stringify(merged, null, 2) + '\n');
	return merged;
};

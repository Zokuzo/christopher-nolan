// Append-only USD ledger (JSONL) enforcing the hard budget cap.
// reserve → settle | void. The last line per id wins; spent = sum(actualUsd ?? estUsd) over non-void ids,
// so a reservation that never settled (crash, lost cost) still counts: the ledger never under-counts.
// ponytail: single-process append, no lockfile; add one if parallel paid runs are ever needed.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { configDir } from '../lib/paths.ts';

export type Kind = 'chat' | 'image' | 'tts' | 'music';
export type Entry = {
	id: string;
	ts: string;
	status: 'reserved' | 'settled' | 'void';
	project: string;
	step: string;
	model: string;
	kind: Kind;
	estUsd: number;
	actualUsd: number | null;
	genId?: string;
};

export const ledgerPath = (): string => join(configDir(), 'ledger.jsonl');

// Throws on a corrupt line: silently skipping one could under-count money.
export const readLedger = (file = ledgerPath()): Entry[] =>
	existsSync(file)
		? readFileSync(file, 'utf8').split('\n').flatMap((line, i) => {
			if (!line.trim()) return [];
			try { return [JSON.parse(line) as Entry]; }
			catch { throw new Error(`ledger ${file} line ${i + 1} is not valid JSON; fix or remove that line`); }
		})
		: [];

export const spentUsd = (entries: Entry[]): number => {
	const last = new Map<string, Entry>();
	for (const e of entries) last.set(e.id, e);
	let sum = 0;
	for (const e of last.values()) if (e.status !== 'void') sum += e.actualUsd ?? e.estUsd;
	return sum;
};

export const usd = (n: number): string => `$${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 4 : 2)}`;

const append = (e: Entry, file: string): Entry => {
	mkdirSync(dirname(file), { recursive: true });
	appendFileSync(file, JSON.stringify(e) + '\n', { mode: 0o600 });
	return e;
};

// Refuses (writes nothing) when spent + estimate would exceed the cap.
export const reserve = (
	meta: Pick<Entry, 'project' | 'step' | 'model' | 'kind' | 'estUsd'>,
	budgetUsd: number,
	file = ledgerPath(),
): Entry => {
	const spent = spentUsd(readLedger(file));
	if (spent + meta.estUsd > budgetUsd + 1e-9) {
		throw new Error(`budget cap reached: spent ${usd(spent)} + estimate ${usd(meta.estUsd)} > budget ${usd(budgetUsd)}\n`
			+ `fix: node cli/nolan.ts config set budgetUsd ${Math.ceil(spent + meta.estUsd + 1)}`);
	}
	return append({ ...meta, id: randomUUID(), ts: new Date().toISOString(), status: 'reserved', actualUsd: null }, file);
};

// actualUsd null (cost unknown) keeps the estimate as the charged amount.
export const settle = (e: Entry, actualUsd: number | null, genId?: string, file = ledgerPath()): Entry =>
	append({ ...e, ts: new Date().toISOString(), status: 'settled', actualUsd, ...(genId ? { genId } : {}) }, file);

export const voidEntry = (e: Entry, file = ledgerPath()): Entry =>
	append({ ...e, ts: new Date().toISOString(), status: 'void', actualUsd: 0 }, file);

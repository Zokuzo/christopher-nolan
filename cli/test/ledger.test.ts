import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLedger, reserve, settle, spentUsd, voidEntry, type Entry } from '../ai/ledger.ts';

const meta = (estUsd: number) => ({ project: 'p', step: 's', model: 'm', kind: 'chat' as const, estUsd });
const tmpLedger = () => join(mkdtempSync(join(tmpdir(), 'nolan-ledger-')), 'ledger.jsonl');

test('spentUsd: last line per id wins, void excluded, unsettled counts its estimate', () => {
	const e = (id: string, status: Entry['status'], estUsd: number, actualUsd: number | null): Entry =>
		({ id, ts: '', status, project: 'p', step: 's', model: 'm', kind: 'chat', estUsd, actualUsd });
	assert.equal(spentUsd([]), 0);
	assert.equal(spentUsd([
		e('a', 'reserved', 0.10, null), e('a', 'settled', 0.10, 0.03), // settled: actual
		e('b', 'reserved', 0.20, null), e('b', 'void', 0.20, 0), // void: nothing
		e('c', 'reserved', 0.05, null), // crashed mid-call: estimate
		e('d', 'reserved', 0.07, null), e('d', 'settled', 0.07, null), // cost unknown: estimate
	]).toFixed(6), (0.03 + 0.05 + 0.07).toFixed(6));
});

test('reserve refuses over the cap and writes nothing; settle/void update spent', () => {
	const file = tmpLedger();
	const a = reserve(meta(0.5), 1, file);
	assert.equal(spentUsd(readLedger(file)), 0.5);
	settle(a, 0.2, 'gen-1', file);
	assert.equal(spentUsd(readLedger(file)), 0.2);
	const b = reserve(meta(0.8), 1, file); // 0.2 + 0.8 == cap: allowed
	voidEntry(b, file);
	assert.equal(spentUsd(readLedger(file)), 0.2);
	const before = readFileSync(file, 'utf8');
	assert.throws(() => reserve(meta(0.81), 1, file), /budget cap reached/);
	assert.equal(readFileSync(file, 'utf8'), before);
	assert.equal(readLedger(file).length, 4);
	assert.equal(readLedger(file).at(-1)?.status, 'void');
});

test('readLedger throws on a corrupt line instead of under-counting', () => {
	const file = tmpLedger();
	writeFileSync(file, '{"id":"a","status":"reserved","estUsd":1}\n{oops\n');
	assert.throws(() => readLedger(file), /line 2/);
});

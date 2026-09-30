import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parentProject, scanRepo } from '../commands/scan.ts';
import { qaFrame } from '../commands/stills.ts';
import { scenarioWarnings } from '../commands/validate.ts';
import { validateScenario } from '../lib/scenario.ts';
import type { Scenario } from '../../src/schema.ts';

const scenario = (data: object): Scenario => {
	const v = validateScenario({ slug: 'zz-test-none', title: 'T', ...data });
	if (!v.ok) throw new Error(v.error);
	return v.scenario;
};

test('scan: repo config cannot run commands, remote credentials are stripped', () => {
	const dir = mkdtempSync(join(tmpdir(), 'nolan-scan-'));
	try {
		const pwned = join(dir, 'PWNED');
		const g = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
		g('init', '-q');
		g('remote', 'add', 'origin', 'https://user:ghp_SECRET@github.com/o/r.git');
		writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
		g('add', '.');
		g('-c', 'user.email=a@b', '-c', 'user.name=a', 'commit', '-qm', 'x');
		g('config', 'core.fsmonitor', `touch ${JSON.stringify(pwned)}; false`); // set last: git itself would run it
		const facts = scanRepo(dir);
		assert.equal(existsSync(pwned), false);
		assert.equal(facts.git && 'remote' in facts.git ? facts.git.remote : undefined, 'https://github.com/o/r.git');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('scan: a subfolder without README/manifest points at the enclosing project', () => {
	const dir = mkdtempSync(join(tmpdir(), 'nolan-up-'));
	try {
		mkdirSync(join(dir, 'cli'));
		writeFileSync(join(dir, 'package.json'), '{"name":"parent-pkg","dependencies":{"x":"1"}}');
		assert.equal(parentProject(join(dir, 'cli')), dir);
		assert.equal(parentProject(dir), undefined);
		assert.equal(scanRepo(join(dir, 'cli')).parent?.name, 'parent-pkg');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('stills: default frame waits for typing/count-ups, stays before the outgoing cut', () => {
	const sc = scenario({ scenes: [
		{ id: 's', type: 'stats', seconds: 4, stats: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }, { label: 'c', value: 3 }] },
		{ id: 't', type: 'title', seconds: 4, title: 'Hi' },
		{ id: 'c', type: 'code', seconds: 1, code: 'x'.repeat(400) },
	] });
	assert.equal(qaFrame(sc, 0, 120), 81); // last stat lands at 10 + 2*8 + 45 = 71, +10
	assert.equal(qaFrame(sc, 1, 120), 60); // no animation: middle
	assert.equal(qaFrame(sc, 2, 30), 29); // typing outlasts the scene: clamped to its last frame
});

test('validate: format-aware limits and outro placement', () => {
	const w = scenarioWarnings(scenario({ format: '9:16', scenes: [
		{ id: 'o', type: 'outro', seconds: 5, title: 'x' },
		{ id: 'k', type: 'kinetic', seconds: 9, text: 'one two three four five six seven eight nine ten eleven twelve thirteen' },
		{ id: 'c', type: 'code', seconds: 7, typing: false, code: Array(20).fill('y'.repeat(50)).join('\n') },
	] })).join('\n');
	assert.match(w, /outro must be the last/);
	assert.match(w, /kinetic has 13 words/);
	assert.match(w, /9s is long for 9:16/);
	assert.match(w, /20 code line\(s\) over 40 chars/);
	assert.doesNotMatch(w, /code has 20 lines/); // 24 allowed in 9:16
});

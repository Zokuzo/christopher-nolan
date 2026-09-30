import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../lib/args.ts';
import { ScenarioSchema } from '../../src/schema.ts';
import { sceneTimeline, totalFrames, transitionFrames } from '../../src/lib/timing.ts';

test('parseArgs: positionals, values, booleans, =, --', () => {
	const r = parseArgs(['music', 'demo', '--q', 'dark synth', '--json', 'x', '--pick=2', '--draft', '--', '--raw'], ['draft']);
	assert.deepEqual(r._, ['music', 'demo', 'x', '--raw']);
	assert.deepEqual(r.flags, { q: 'dark synth', json: true, pick: '2', draft: true });
	assert.deepEqual(parseArgs(['--stop']).flags, { stop: true });
});

const scenario = (over: object = {}) => ScenarioSchema.parse({
	slug: 't', title: 'T',
	scenes: [
		{ id: 'a', type: 'title', seconds: 3 },
		{ id: 'b', type: 'code', seconds: 4, transition: 'none' },
		{ id: 'c', type: 'outro', seconds: 2 },
	],
	...over,
});

test('schema fills nested defaults', () => {
	const s = scenario();
	assert.equal(s.fps, 30);
	assert.equal(s.format, '16:9');
	assert.deepEqual(s.transition, { type: 'fade', frames: 20 });
	assert.equal(s.audio.music.duckTo, 0.2);
	assert.equal(s.audio.sfx.auto, true);
	assert.equal(ScenarioSchema.safeParse({ slug: 'Bad Slug', title: 'x', scenes: [] }).success, false);
});

test('timing: overlaps, none cuts, clamping', () => {
	const s = scenario();
	assert.equal(transitionFrames(s, 0), 20);
	assert.equal(transitionFrames(s, 1), 0); // 'none'
	assert.equal(transitionFrames(s, 2), 0); // last scene
	assert.equal(totalFrames(s), 90 + 120 + 60 - 20);
	assert.deepEqual(sceneTimeline(s).map((e) => e.from), [0, 70, 190]);
	const short = scenario({ transition: { type: 'fade', frames: 100 } });
	assert.equal(transitionFrames(short, 0), 89); // never longer than a neighbour
});

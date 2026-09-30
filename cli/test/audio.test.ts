import { test } from 'node:test';
import assert from 'node:assert/strict';
import { licenseFromUrl, queryFallbacks, rank, safeLicense, scoreTrack, type Track } from '../audio/sources.ts';
import { audioExt } from '../audio/media.ts';
import { mergeLock, type LockEntry } from '../lib/lock.ts';
import { neededSfx } from '../commands/audio.ts';
import { ScenarioSchema } from '../../src/schema.ts';

const track = (over: Partial<Track>): Track => ({
	id: 'x', provider: 'openverse/jamendo', title: 't', creator: 'c', license: 'by', licenseVersion: '3.0', licenseUrl: '',
	attribution: '', sourceUrl: '', url: 'https://x/y.mp3', seconds: 120, tags: [], ...over,
});

test('license filter: cc0/pdm/by only, by-sa opt-in, never nd/nc', () => {
	for (const l of ['cc0', 'pdm', 'by', 'BY']) assert.equal(safeLicense(l), true, l);
	for (const l of ['by-nd', 'by-nc', 'by-nc-sa', 'by-nc-nd', 'nc', 'sampling+', '']) assert.equal(safeLicense(l, true), false, l);
	assert.equal(safeLicense('by-sa'), false);
	assert.equal(safeLicense('by-sa', true), true);
	assert.equal(licenseFromUrl('http://creativecommons.org/licenses/by-nc/3.0/'), 'by-nc');
	assert.equal(licenseFromUrl('https://creativecommons.org/licenses/by/4.0/'), 'by');
	assert.equal(licenseFromUrl('https://creativecommons.org/publicdomain/zero/1.0/'), 'cc0');
	assert.equal(licenseFromUrl('http://ccmixter.org/sampling+'), '');
});

test('music scoring: mood overlap, instrumental, long enough, bpm and speed tags', () => {
	const want = { kind: 'music' as const, words: ['cinematic', 'ambient', 'instrumental'], seconds: 47, bpm: [70, 90] as [number, number] };
	const good = track({ tags: ['cinematic', 'dark ambient', 'instrumental', 'speed_low'], seconds: 180 });
	assert.ok(scoreTrack(good, want) > scoreTrack(track({ tags: ['cinematic', 'ambient'], seconds: 180 }), want), 'instrumental bonus');
	assert.ok(scoreTrack(good, want) > scoreTrack({ ...good, seconds: 30 }, want), 'too short is penalised');
	assert.ok(scoreTrack(good, want) > scoreTrack({ ...good, tags: [...good.tags, 'vocals'] }, want), 'vocals penalised');
	assert.ok(scoreTrack(good, want) > scoreTrack({ ...good, tags: ['cinematic', 'dark ambient', 'instrumental', 'speed_high'] }, want), 'speed tag');
	assert.ok(scoreTrack({ ...good, bpm: 80 }, want) > scoreTrack({ ...good, bpm: 140 }, want), 'bpm in range');
	assert.ok(scoreTrack({ ...good, license: 'cc0' }, want) > scoreTrack(good, want), 'cc0 slightly preferred');
	// Stable ranking: equal scores keep provider order.
	const [a, b] = [track({ id: 'a' }), track({ id: 'b' })];
	assert.deepEqual(rank([a, b], want).map((r) => r.track.id), ['a', 'b']);
});

test('sfx scoring prefers short sounds matching the query', () => {
	const want = { kind: 'sfx' as const, words: ['whoosh'] };
	const short = track({ title: 'Fast Whoosh 01', seconds: 1.2 });
	assert.ok(scoreTrack(short, want) > scoreTrack({ ...short, seconds: 22 }, want));
	assert.ok(scoreTrack(short, want) > scoreTrack({ ...short, title: 'door slam' }, want));
});

test('lock merge replaces by id in place and appends new ids', () => {
	const e = (id: string, title = id): LockEntry => ({ id, kind: 'sfx', file: `f/${id}`, title, creator: '', license: '', licenseUrl: '', attribution: '', sourceUrl: '', provider: '' });
	const merged = mergeLock([e('music'), e('sfx-a'), e('voice-1')], [e('sfx-a', 'new'), e('sfx-b')]);
	assert.deepEqual(merged.map((x) => `${x.id}:${x.title}`), ['music:music', 'sfx-a:new', 'voice-1:voice-1', 'sfx-b:sfx-b']);
	assert.deepEqual(mergeLock([], [e('x'), e('x', 'dup')]).map((x) => x.title), ['dup']);
});

test('audio magic bytes', () => {
	assert.equal(audioExt(new TextEncoder().encode('ID3\x04rest')), 'mp3');
	assert.equal(audioExt(Uint8Array.from([0xff, 0xfb, 0x90, 0x00])), 'mp3');
	assert.equal(audioExt(new TextEncoder().encode('RIFF\0\0\0\0WAVEfmt ')), 'wav');
	assert.equal(audioExt(new TextEncoder().encode('OggS\0\0')), 'ogg');
	assert.equal(audioExt(new TextEncoder().encode('<!DOCTYPE html>')), undefined);
});

test('needed sfx = auto cues + scene sfx, none when disabled', () => {
	const s = ScenarioSchema.parse({ slug: 'a', title: 'A', scenes: [{ id: 's', type: 'title', seconds: 2, sfx: [{ name: 'pop', at: 0 }, { name: 'whoosh', at: 1 }] }] });
	assert.deepEqual(neededSfx(s), ['whoosh', 'impact', 'riser', 'click', 'ding', 'pop']);
	assert.deepEqual(neededSfx({ ...s, audio: { ...s.audio, sfx: { ...s.audio.sfx, auto: false } } }), ['pop', 'whoosh']);
	assert.deepEqual(neededSfx({ ...s, audio: { ...s.audio, sfx: { ...s.audio.sfx, enabled: false } } }), []);
});

test('openverse query fallbacks drop words (AND semantics), max 3 requests', () => {
	assert.deepEqual(queryFallbacks('cinematic ambient instrumental'), ['cinematic ambient instrumental', 'cinematic ambient', 'cinematic']);
	assert.deepEqual(queryFallbacks('whoosh'), ['whoosh']);
	assert.deepEqual(queryFallbacks('a b c d'), ['a b c d', 'a b', 'a']);
});

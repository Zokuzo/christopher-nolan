// nolan audio search|music|sfx|all — CC music bed + sound effects, no API key.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandContext } from '../nolan.ts';
import type { Scenario } from '../../src/schema.ts';
import { totalFrames } from '../../src/lib/timing.ts';
import { parseArgs, num, str, type Flags } from '../lib/args.ts';
import { fail, info, json, next, ok, warn } from '../lib/log.ts';
import { PUBLIC_DIR, assertSlug, publicProjectDir } from '../lib/paths.ts';
import { loadScenario, updateScenario } from '../lib/scenario.ts';
import { readLock, updateLock, type LockEntry } from '../lib/lock.ts';
import { readState } from '../lib/state.ts';
import { probeDuration } from '../lib/ffmpeg.ts';
import { licenseLabel, rank, searchCcMixter, searchOpenverse, sfxQuery, type Kind, type Track, type Want } from '../audio/sources.ts';
import { download, normalizeMusic, normalizeSfx } from '../audio/media.ts';

const USAGE = 'audio search --kind music|sfx --q "..." [--length shortest|short|medium|long] [--allow-sa] [--json]\n'
	+ '       audio music <slug> [--q "..."] [--pick N] [--allow-sa] [--force]\n'
	+ '       audio sfx <slug> [--force] [--allow-sa]\n'
	+ '       audio all <slug> [--allow-sa]';

// Cues Mix.tsx fires when audio.sfx.auto is on (SPEC §3).
export const AUTO_SFX = ['whoosh', 'impact', 'riser', 'click', 'ding'];

export const neededSfx = (scenario: Pick<Scenario, 'audio' | 'scenes'>): string[] => {
	if (!scenario.audio.sfx.enabled) return [];
	const names = scenario.audio.sfx.auto ? [...AUTO_SFX] : [];
	for (const s of scenario.scenes) for (const x of s.sfx ?? []) names.push(x.name);
	return [...new Set(names)];
};

type Ranked = { track: Track; score: number }[];

const fmtTime = (s?: number): string => (s === undefined ? '  ?  ' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const printRanked = (list: Ranked, max: number): void => list.slice(0, max).forEach(({ track: t, score }, i) =>
	info(`  ${String(i + 1).padStart(2)}. [${score.toFixed(1).padStart(5)}] ${licenseLabel(t.license, t.licenseVersion).padEnd(14)} ${fmtTime(t.seconds)}  "${t.title}" by ${t.creator}  (${t.provider}${t.bpm ? `, ${t.bpm} bpm` : ''})`));

const lockEntry = (id: string, kind: 'music' | 'sfx', file: string, t: Track): LockEntry => ({
	id, kind, file, title: t.title, creator: t.creator, license: licenseLabel(t.license, t.licenseVersion), licenseUrl: t.licenseUrl,
	attribution: t.attribution || `"${t.title}" by ${t.creator} (${licenseLabel(t.license, t.licenseVersion)})`, sourceUrl: t.sourceUrl, provider: t.provider,
});

const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback);

// ---------- search ----------

const search = async (flags: Flags): Promise<void> => {
	const kind = (str(flags, 'kind') ?? 'music') as Kind;
	if (kind !== 'music' && kind !== 'sfx') return fail(`--kind must be music or sfx, got "${kind}"`, `nolan ${USAGE.split('\n')[0]}`);
	const q = str(flags, 'q');
	if (!q) return fail('missing --q', `nolan audio search --kind ${kind} --q "cinematic ambient"`);
	const allowSa = flags['allow-sa'] === true;
	let tracks: Track[];
	try {
		tracks = await searchOpenverse(q, kind, { allowSa, length: str(flags, 'length') });
	} catch (e) {
		if (kind === 'sfx') return fail(`Openverse: ${(e as Error).message}`, 'retry later (anonymous limit 20/min, 200/day); cached queries still work');
		warn(`Openverse: ${(e as Error).message} → ccMixter`);
		tracks = await searchCcMixter(q.split(/\s+/), { allowSa });
	}
	const ranked = rank(tracks, { kind, words: q.split(/\s+/) });
	if (flags.json) return json(ranked.map(({ track, score }) => ({ score, ...track })));
	info(`${ranked.length} result(s) for "${q}" (${kind}, licenses cc0/pdm/by${allowSa ? '/by-sa' : ''}):`);
	printRanked(ranked, 10);
	next(kind === 'music' ? 'nolan audio music <slug> --q "<query>" [--pick N]' : 'nolan audio sfx <slug>');
};

// ---------- music ----------

type Candidates = { source: string; ranked: Ranked };

// Openverse → ccMixter; each provider must yield at least one track scoring >= 0 (else next provider).
const findMusic = async (q: string, want: Want, allowSa: boolean, pick?: number): Promise<Candidates | undefined> => {
	const providers: [string, () => Promise<Track[]>][] = [
		['Openverse', () => searchOpenverse(q, 'music', { allowSa })],
		['ccMixter', () => searchCcMixter(want.words, { allowSa })],
	];
	for (const [source, fetchTracks] of providers) {
		try {
			const ranked = rank(await fetchTracks(), want);
			const good = ranked.filter((r) => r.score >= 0);
			if (pick ? ranked.length >= pick : good.length) return { source, ranked: pick ? ranked : good };
			warn(`${source}: no suitable track for "${q}"`);
		} catch (e) {
			warn(`${source}: ${(e as Error).message}`);
		}
	}
	return undefined;
};

type BundledTrack = { id: string; file: string; title: string; creator: string; license: string; licenseUrl: string; attribution: string; sourceUrl: string };

const useBundledMusic = (slug: string): void => {
	const list = readJson<BundledTrack[]>(join(PUBLIC_DIR, 'music', 'index.json'), []);
	const bed = list.find((b) => existsSync(join(PUBLIC_DIR, b.file)));
	if (!bed) return fail('no music found online and no bundled bed in public/music', 'node cli/nolan.ts setup');
	updateScenario(slug, (s) => { s.audio.music.src = bed.file; });
	updateLock(slug, [{ id: 'music', kind: 'music', file: bed.file, title: bed.title, creator: bed.creator, license: bed.license, licenseUrl: bed.licenseUrl, attribution: bed.attribution, sourceUrl: bed.sourceUrl, provider: 'bundled' }]);
	ok(`music: bundled "${bed.title}" → ${bed.file} (loops under the video)`);
};

const music = async (slug: string, flags: Flags): Promise<void> => {
	const scenario = loadScenario(slug);
	const need = Math.ceil(totalFrames(scenario) / scenario.fps) + 2;
	const mood = scenario.audio.music.mood;
	const q = str(flags, 'q') ?? (mood.length ? `${mood.join(' ')} instrumental` : 'cinematic ambient instrumental');
	const want: Want = { kind: 'music', words: q.split(/\s+/), seconds: need, bpm: scenario.audio.music.bpm };
	const pick = num(flags, 'pick');
	if (pick !== undefined && (!Number.isInteger(pick) || pick < 1)) return fail('--pick expects a rank >= 1', `nolan audio search --kind music --q "${q}"`);

	const found = await findMusic(q, want, flags['allow-sa'] === true, pick);
	if (!found) return useBundledMusic(slug);
	info(`music candidates (${found.source}, query "${q}", need >= ${need}s):`);
	printRanked(found.ranked, 5);

	const out = join(publicProjectDir(slug), 'audio', 'music.mp3');
	const rel = `projects/${slug}/audio/music.mp3`;
	for (const { track } of pick ? [found.ranked[pick - 1]] : found.ranked.slice(0, 3)) {
		try {
			await normalizeMusic(await download(track.url, track.sourceUrl), out, need);
			const dur = await probeDuration(out);
			updateScenario(slug, (s) => { s.audio.music.src = rel; });
			updateLock(slug, [lockEntry('music', 'music', rel, track)]);
			ok(`music: "${track.title}" by ${track.creator} (${licenseLabel(track.license, track.licenseVersion)}) → public/${rel} (${dur.toFixed(1)}s, -16 LUFS)`);
			if (dur < need - 2) warn(`track is shorter than the video (${dur.toFixed(1)}s < ${need - 2}s): it will loop`);
			const weak = found.ranked.length < 3 || found.source !== 'Openverse';
			if (!pick && (weak || /\b(cover|remix|theme|ost|soundtrack)\b/i.test(track.title)))
				warn(`check this pick with the user before keeping it: ${weak ? `only ${found.ranked.length} candidate(s) from ${found.source}` : 'the title names another work'}; a title naming a film, series or game may be a cover of a copyrighted theme (other picks: --pick N, or nolan audio search --kind music)`);
			return;
		} catch (e) {
			warn(`skip "${track.title}": ${(e as Error).message}`);
		}
	}
	warn('every candidate failed to download or convert');
	useBundledMusic(slug);
};

// ---------- sfx ----------

type SfxCredit = { title: string; creator: string; license: string; licenseUrl: string; attribution: string; sourceUrl: string; provider: string };

const sfx = async (slug: string, flags: Flags): Promise<void> => {
	const scenario = loadScenario(slug);
	const names = neededSfx(scenario);
	if (!names.length) { ok('sfx: none needed (audio.sfx disabled, no auto cues, no scene sfx)'); return; }
	const index = readJson<Record<string, string>>(join(PUBLIC_DIR, 'sfx', 'index.json'), {});
	const credits = readJson<Record<string, SfxCredit>>(join(PUBLIC_DIR, 'sfx', 'credits.json'), {});
	const lock = readLock(slug);
	const entries: LockEntry[] = [];
	const missing: string[] = [];
	for (const name of names) {
		const id = `sfx-${name}`;
		if (index[name]) {
			const c = credits[name];
			if (c) entries.push({ id, kind: 'sfx', file: index[name], ...c });
			info(`  ${name.padEnd(10)} bundled  ${index[name]}`);
			continue;
		}
		const rel = `projects/${slug}/audio/sfx-${name}.mp3`;
		if (!flags.force && existsSync(join(PUBLIC_DIR, rel)) && lock.some((e) => e.id === id)) { info(`  ${name.padEnd(10)} present  ${rel}`); continue; }
		let done = false;
		try {
			const ranked = rank(await searchOpenverse(sfxQuery(name), 'sfx', { allowSa: flags['allow-sa'] === true }), { kind: 'sfx', words: sfxQuery(name).split(' ') });
			for (const { track } of ranked.slice(0, 3)) {
				try {
					await normalizeSfx(await download(track.url, track.sourceUrl), join(PUBLIC_DIR, rel));
					entries.push(lockEntry(id, 'sfx', rel, track));
					info(`  ${name.padEnd(10)} fetched  ${rel}  "${track.title}" by ${track.creator} (${licenseLabel(track.license, track.licenseVersion)})`);
					done = true;
					break;
				} catch (e) { warn(`${name}: skip "${track.title}": ${(e as Error).message}`); }
			}
		} catch (e) { warn(`${name}: Openverse: ${(e as Error).message}`); }
		if (!done) missing.push(name);
	}
	if (entries.length) updateLock(slug, entries);
	if (missing.length) warn(`no sound for: ${missing.join(', ')} (Mix skips them). Fix: node cli/nolan.ts setup, or rename the scene sfx to one of: ${Object.keys(index).join(', ')}`);
	ok(`sfx: ${names.length - missing.length}/${names.length} available, credits in public/projects/${slug}/assets.lock.json`);
};

export async function run(args: string[], _ctx: CommandContext): Promise<void> {
	const [sub, ...rest] = args;
	const { _, flags } = parseArgs(rest, ['allow-sa', 'force']);
	if (sub === 'search') return search(flags);
	if (sub !== 'music' && sub !== 'sfx' && sub !== 'all') return fail(sub ? `unknown audio subcommand "${sub}"` : 'missing audio subcommand', `nolan ${USAGE}`);
	const slug = assertSlug(_[0]);
	// An approved video is final: fetching again could swap its track and credits.
	if (readState(slug).stage === 'approved' && !flags.force) return fail(`${slug} is approved; audio ${sub} would replace its assets`, `nolan reopen ${slug} first (or add --force)`);
	if (sub === 'music' || sub === 'all') await music(slug, flags);
	if (sub === 'sfx' || sub === 'all') await sfx(slug, flags);
	// Stills before Studio: SKILL rule 7 (look before you show).
	next(`nolan stage ${slug} preview && nolan stills ${slug}  (then nolan studio ${slug})`);
}

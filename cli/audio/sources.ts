// Free audio sources (no API key): Openverse (primary), ccMixter (music fallback).
// Verified behaviour and gotchas: docs/research/audio.md + critic.md.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { join } from 'node:path';
import { CACHE_DIR } from '../lib/paths.ts';

export const UA = 'christopher-nolan/0.1 (+https://github.com/Zokuzo/christopher-nolan)';

export type Kind = 'music' | 'sfx';
export type Track = {
	id: string;
	provider: string; // "openverse/jamendo", "openverse/freesound", "ccmixter"
	title: string;
	creator: string;
	license: string; // short code: cc0, pdm, by, by-sa, ...
	licenseVersion: string;
	licenseUrl: string;
	attribution: string;
	sourceUrl: string; // landing page
	url: string; // direct audio file
	seconds?: number;
	tags: string[]; // lowercase tags + genres
	bpm?: number;
};
export type Want = { kind: Kind; words: string[]; seconds?: number; bpm?: [number, number] };

// ---------- pure helpers (tested in cli/test/audio.test.ts) ----------

// ND can't be synced to video (adaptation), NC can't be used commercially. SA only on explicit opt-in.
export const safeLicense = (license: string, allowSa = false): boolean => {
	const l = license.toLowerCase().trim();
	if (/(^|-)(nd|nc)(-|$)/.test(l)) return false;
	return l === 'cc0' || l === 'pdm' || l === 'by' || (allowSa && l === 'by-sa');
};

export const licenseParam = (allowSa = false): string => (allowSa ? 'cc0,pdm,by,by-sa' : 'cc0,pdm,by');

// "http://creativecommons.org/licenses/by-nc/3.0/" → "by-nc"; publicdomain/zero → cc0; anything else → "".
export const licenseFromUrl = (url: string): string => {
	const m = /creativecommons\.org\/(licenses|publicdomain)\/([a-z+-]+)/i.exec(url);
	if (!m) return '';
	if (m[1].toLowerCase() === 'publicdomain') return m[2].toLowerCase() === 'zero' ? 'cc0' : m[2].toLowerCase() === 'mark' ? 'pdm' : '';
	return m[2].toLowerCase();
};

export const licenseLabel = (license: string, version = ''): string =>
	license === 'cc0' ? 'CC0 1.0'
	: license === 'pdm' ? 'Public Domain Mark 1.0'
	: `CC ${license.toUpperCase()}${version ? ` ${version}` : ''}`;

const speedOf = (bpm: number): string => (bpm < 90 ? 'speed_low' : bpm <= 125 ? 'speed_medium' : 'speed_high');

// Higher is better. Music: mood tags, instrumental, long enough, tempo. Sfx: query words, short.
export const scoreTrack = (t: Track, want: Want): number => {
	const tags = t.tags.map((x) => x.toLowerCase());
	const hay = want.kind === 'sfx' ? [...tags, ...t.title.toLowerCase().split(/[^a-z0-9]+/)] : tags;
	const words = [...new Set(want.words.flatMap((w) => w.toLowerCase().split(/\s+/)).filter((w) => w.length > 2 && w !== 'instrumental'))];
	let s = words.filter((w) => hay.some((h) => h.includes(w))).length * 2;
	if (t.license === 'cc0' || t.license === 'pdm') s += 0.5;
	const sec = t.seconds;
	if (want.kind === 'sfx') {
		if (sec === undefined) s -= 1;
		else if (sec >= 0.15 && sec <= 3) s += 3;
		else if (sec <= 6) s += 1;
		else s -= 3;
		return s;
	}
	if (tags.includes('instrumental')) s += 2;
	if (tags.some((x) => /vocal|singer|lyrics|song|rap/.test(x))) s -= 2;
	if (sec === undefined) s -= 1;
	else if (want.seconds) {
		if (sec < want.seconds) s -= 4; // would have to loop
		else s += 1;
		if (sec > 480) s -= 2; // huge download for a short video
	}
	if (want.bpm) {
		const [lo, hi] = want.bpm;
		if (t.bpm !== undefined) s += t.bpm >= lo && t.bpm <= hi ? 3 : -Math.min(3, Math.min(Math.abs(t.bpm - lo), Math.abs(t.bpm - hi)) / 10);
		const speed = tags.find((x) => x.startsWith('speed_'));
		if (speed) s += speed === speedOf((lo + hi) / 2) ? 1.5 : -1;
	}
	return s;
};

// Stable sort: equal scores keep the provider's relevance order.
export const rank = (tracks: Track[], want: Want): { track: Track; score: number }[] =>
	tracks.map((track) => ({ track, score: Math.round(scoreTrack(track, want) * 10) / 10 })).sort((a, b) => b.score - a.score);

// Search words for sfx names Mix auto-cues (and a few common extras).
const SFX_QUERIES: Record<string, string> = {
	whoosh: 'whoosh',
	impact: 'cinematic impact boom',
	riser: 'riser',
	click: 'mouse click',
	ding: 'ding bell',
	pop: 'pop',
};
export const sfxQuery = (name: string): string => SFX_QUERIES[name] ?? name.replace(/[-_]+/g, ' ');

// "3:38" → 218
const mmss = (ps?: string): number | undefined => {
	const m = /^(\d+):(\d{2})$/.exec(ps ?? '');
	return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

// ---------- network ----------

// node:https instead of fetch: ccMixter echoes the whole JSON body in an `X-JSON` response header,
// which overflows undici's 16 KB header limit (UND_ERR_HEADERS_OVERFLOW) for any useful page size.
const getHttpsJson = (url: string): Promise<unknown> => new Promise((resolve, reject) => {
	const req = https.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, maxHeaderSize: 4 << 20, timeout: 20_000 }, (res) => {
		let body = '';
		res.setEncoding('utf8');
		res.on('data', (d: string) => (body += d));
		res.on('end', () => {
			const code = res.statusCode ?? 0;
			if (code < 200 || code >= 300) return reject(new Error(`${new URL(url).host} ${code}${code === 429 ? ' (rate limit: 20/min, 200/day)' : ''}`));
			try { resolve(JSON.parse(body)); } catch { reject(new Error(`${new URL(url).host}: invalid JSON`)); }
		});
	});
	req.on('timeout', () => req.destroy(new Error(`${new URL(url).host}: timeout`)));
	req.on('error', reject);
});

const getJson = async (url: string, cacheName: string): Promise<unknown> => {
	const file = join(CACHE_DIR, cacheName, `${createHash('sha1').update(url).digest('hex')}.json`);
	if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
	const data = await getHttpsJson(url);
	mkdirSync(join(CACHE_DIR, cacheName), { recursive: true });
	writeFileSync(file, JSON.stringify(data));
	return data;
};

type OvResult = {
	id: string; title?: string; url: string; creator?: string; license: string; license_version?: string;
	license_url?: string; attribution?: string; foreign_landing_url?: string; source?: string; duration?: number | null;
	tags?: { name: string }[] | null; genres?: string[] | null; mature?: boolean;
};

// Openverse ANDs every word, so a 3-word mood query often returns 0: retry with fewer words
// (full query → first 2 mood words → first word). Scoring still uses every word against the tags.
export const queryFallbacks = (q: string): string[] => {
	const words = q.trim().split(/\s+/).filter(Boolean);
	const core = words.filter((w) => w.toLowerCase() !== 'instrumental');
	const out = [words.join(' ')];
	out.push(core.slice(0, 2).join(' '), core.slice(0, 1).join(' '));
	return [...new Set(out)].filter(Boolean).slice(0, 3);
};

// Openverse: music = category=music (Jamendo); sfx = source=freesound&length=shortest (category=sound_effect returns 0).
export const searchOpenverse = async (q: string, kind: Kind, opts: { allowSa?: boolean; length?: string } = {}): Promise<Track[]> => {
	let results: OvResult[] = [];
	for (const query of queryFallbacks(q)) {
		const p = new URLSearchParams({ q: query, license: licenseParam(opts.allowSa), page_size: '20', mature: 'false' });
		if (kind === 'music') p.set('category', 'music');
		else { p.set('source', 'freesound'); p.set('length', 'shortest'); }
		if (opts.length) p.set('length', opts.length);
		results = ((await getJson(`https://api.openverse.org/v1/audio/?${p}`, 'openverse')) as { results?: OvResult[] }).results ?? [];
		if (results.length) break;
	}
	return results
		.filter((r) => r.url && !r.mature && safeLicense(r.license, opts.allowSa))
		.map((r) => ({
			id: r.id,
			provider: `openverse/${r.source ?? 'unknown'}`,
			title: r.title ?? 'Untitled',
			creator: r.creator ?? 'Unknown',
			license: r.license,
			licenseVersion: r.license_version ?? '',
			licenseUrl: r.license_url ?? '',
			attribution: r.attribution ?? '',
			sourceUrl: r.foreign_landing_url ?? r.url,
			url: r.url,
			seconds: r.duration ? r.duration / 1000 : undefined,
			tags: [...(r.tags ?? []).map((t) => t.name.toLowerCase()), ...(r.genres ?? []).map((g) => g.toLowerCase())],
		}));
};

type CcUpload = {
	upload_id: number; upload_name: string; user_name: string; license_name: string; license_url: string;
	file_page_url: string; upload_tags?: string; upload_extra?: { bpm?: number | string };
	files?: { download_url: string; file_format_info?: { mime_type?: string; ps?: string } }[];
};

// ccMixter: attribution-only (lic=by), instrumental; bpm comes from upload_extra.bpm.
export const searchCcMixter = async (words: string[], opts: { allowSa?: boolean } = {}): Promise<Track[]> => {
	const tags = ['instrumental', ...words.slice(0, 1).map((w) => w.toLowerCase().replace(/\s+/g, '_'))].join(',');
	const run = async (t: string): Promise<CcUpload[]> =>
		(await getJson(`https://ccmixter.org/api/query?f=json&tags=${encodeURIComponent(t)}&lic=by&sort=rank&limit=40`, 'ccmixter')) as CcUpload[];
	let uploads = await run(tags);
	if (!uploads.length && tags !== 'instrumental') uploads = await run('instrumental');
	const out: Track[] = [];
	for (const u of uploads) {
		const license = licenseFromUrl(u.license_url);
		if (!safeLicense(license, opts.allowSa)) continue;
		// Longest mp3 = the main mix (others are stems/snippets).
		const mp3s = (u.files ?? []).filter((f) => f.file_format_info?.mime_type === 'audio/mpeg')
			.map((f) => ({ url: f.download_url, seconds: mmss(f.file_format_info?.ps) }))
			.sort((a, b) => (b.seconds ?? 0) - (a.seconds ?? 0));
		if (!mp3s.length) continue;
		const version = /\/(\d\.\d)\/?/.exec(u.license_url)?.[1] ?? '';
		const bpm = Number(u.upload_extra?.bpm);
		out.push({
			id: String(u.upload_id),
			provider: 'ccmixter',
			title: u.upload_name,
			creator: u.user_name,
			license,
			licenseVersion: version,
			licenseUrl: u.license_url,
			attribution: `"${u.upload_name}" by ${u.user_name} is licensed under ${licenseLabel(license, version)}. ${u.license_url}`,
			sourceUrl: u.file_page_url,
			url: mp3s[0].url,
			seconds: mp3s[0].seconds,
			tags: (u.upload_tags ?? '').split(',').filter(Boolean).map((t) => t.toLowerCase()),
			bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : undefined,
		});
	}
	return out;
};

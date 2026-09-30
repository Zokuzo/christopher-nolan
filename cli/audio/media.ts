// Download (cached, verified to be audio) and normalize with ffmpeg (system or Remotion's bundled one).
// Bundled ffmpeg has no afade/ebur128/lavfi: only loudnorm, volume, silencedetect, atrim... (critic.md).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CACHE_DIR } from '../lib/paths.ts';
import { ffmpeg } from '../lib/ffmpeg.ts';
import { UA } from './sources.ts';

// Content-type can lie (Incompetech serves octet-stream), so magic bytes also count.
export const audioExt = (buf: Uint8Array): string | undefined => {
	const ascii = (from: number, to: number): string => String.fromCharCode(...buf.subarray(from, to));
	if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
	if (ascii(0, 4) === 'OggS') return 'ogg';
	if (ascii(0, 4) === 'fLaC') return 'flac';
	if (ascii(4, 8) === 'ftyp') return 'm4a';
	return undefined;
};

// Returns the cached local file. Throws on HTTP errors or non-audio bodies (HTML error pages...).
// `referer` = the track's landing page: ccMixter answers 403 to hotlinks without one.
export const download = async (url: string, referer?: string): Promise<string> => {
	const base = join(CACHE_DIR, 'audio', createHash('sha1').update(url).digest('hex'));
	for (const ext of ['mp3', 'wav', 'ogg', 'flac', 'm4a']) if (existsSync(`${base}.${ext}`)) return `${base}.${ext}`;
	const res = await fetch(url, { headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) }, redirect: 'follow', signal: AbortSignal.timeout(90_000) });
	if (!res.ok) throw new Error(`download ${res.status} ${url}`);
	const buf = new Uint8Array(await res.arrayBuffer());
	const type = res.headers.get('content-type') ?? '';
	const ext = audioExt(buf) ?? (type.startsWith('audio/') ? 'mp3' : undefined);
	if (!ext) throw new Error(`not an audio file (${type || 'no content-type'}): ${url}`);
	mkdirSync(dirname(base), { recursive: true });
	writeFileSync(`${base}.part`, buf);
	renameSync(`${base}.part`, `${base}.${ext}`);
	return `${base}.${ext}`;
};

type Measure = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };

// One analysis pass: loudnorm stats + leading silence (silencedetect).
const analyze = async (input: string, seconds?: number): Promise<{ m: Measure; lead: number }> => {
	const r = await ffmpeg(['-hide_banner', '-nostats', '-i', input, '-vn', ...(seconds ? ['-t', String(seconds)] : []),
		'-af', 'silencedetect=n=-50dB:d=0.05,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
	const json = r.stderr.slice(r.stderr.lastIndexOf('{'), r.stderr.lastIndexOf('}') + 1);
	if (r.code !== 0 || !json) throw new Error(`ffmpeg could not analyze ${input}: ${r.stderr.trim().split('\n').pop() ?? ''}`);
	const lead = /silence_start: (-?[\d.e-]+)[\s\S]*?silence_end: ([\d.]+)/.exec(r.stderr);
	return { m: JSON.parse(json) as Measure, lead: lead && Math.abs(Number(lead[1])) < 0.01 ? Number(lead[2]) : 0 };
};

const encode = async (input: string, out: string, pre: string[], af: string, kbps: number): Promise<void> => {
	mkdirSync(dirname(out), { recursive: true });
	const r = await ffmpeg(['-hide_banner', '-y', ...pre, '-i', input, '-vn', '-map_metadata', '-1', '-af', af,
		'-ar', '48000', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, out]);
	if (r.code !== 0) throw new Error(`ffmpeg failed on ${input}: ${r.stderr.trim().split('\n').pop() ?? ''}`);
};

// Music bed: drop leading silence (the bed starts with the video), optional trim, two-pass loudnorm to -16 LUFS, mp3 48 kHz. Fades/ducking happen in Remotion.
export const normalizeMusic = async (input: string, out: string, maxSeconds?: number, kbps = 192): Promise<void> => {
	const { m, lead } = await analyze(input, maxSeconds);
	const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
	const ok = [m.input_i, m.input_tp, m.input_lra, m.input_thresh].every((v) => Number.isFinite(Number(v)));
	await encode(input, out, [...(lead > 0 ? ['-ss', lead.toFixed(3)] : []), ...(maxSeconds ? ['-t', String(maxSeconds)] : [])], `loudnorm=I=-16:TP=-1.5:LRA=11${ok ? `:${measured}:linear=true` : ''}`, kbps);
};

// Sfx: loudnorm is unreliable under 3 s, so peak-normalize to -1.5 dBTP; drop leading silence (cue timing), cap length.
export const normalizeSfx = async (input: string, out: string, maxSeconds = 4): Promise<void> => {
	const { m, lead } = await analyze(input);
	const tp = Number(m.input_tp);
	const gain = Number.isFinite(tp) ? Math.min(24, -1.5 - tp) : 0;
	await encode(input, out, [...(lead > 0 ? ['-ss', lead.toFixed(3)] : []), '-t', String(maxSeconds)], `volume=${gain.toFixed(2)}dB`, 192);
};

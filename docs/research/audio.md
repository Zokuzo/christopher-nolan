# Audio sourcing brief for Christopher Nolan: background music and SFX with no API key

Everything below was checked live with curl, ffmpeg and ffprobe on 2026-09-30, unless marked **[UNVERIFIED]**.

## 1. Recommendation
- **Primary source: Openverse** (`https://api.openverse.org/v1/audio/`). It needs no key and gives one search over Jamendo (644,709 items), Wikimedia (3,965,183) and Freesound (591,449), per `/v1/audio/stats/`.
- **Music fallback: ccMixter** (`https://ccmixter.org/api/query`). No key needed. It returns real **BPM** values, and its mp3 links download directly.
- **Last resort:** a small bundled `assets/audio/` pack of CC0 SFX (whoosh, click, pop, riser, impact) plus 2 or 3 CC0 or CC-BY beds. This keeps the tool working offline and when the rate limit runs out.
- **Skip:** Freesound direct API, Jamendo API, Pixabay (all need keys), and the FMA API (gone, returns 404).

## 2. Openverse, verified behaviour

**Rate limits for anonymous use** (response headers):
```
x-ratelimit-limit-anon_burst: 20/min
x-ratelimit-limit-anon_sustained: 200/day
```
- `page_size` is capped at 20: "page_size may not exceed 20 for anonymous requests".
- Pagination is capped at 240 results: "pagination depth may not exceed 240 for anonymous requests". So `result_count` tops out at 240.
- **Upgrade path:** free registration via `POST /v1/auth_tokens/register/` returns a client_id and secret, then use OAuth client_credentials for higher limits. **[UNVERIFIED live; documented behaviour]** Build it as an optional `OPENVERSE_CLIENT_ID` / `OPENVERSE_CLIENT_SECRET` pair.
- The 200/day limit applies per IP. Cache every search response on disk (`.cache/openverse/<sha>.json`).

**Query parameters**
- `q`: the search text.
- `license=by,by-sa,cc0,pdm`: an explicit list. Prefer this over `license_type`.
- `license_type=commercial,modification`: also works.
- `source=jamendo|freesound|wikimedia_audio`
- `category=music`: works, because Jamendo items carry categories.
- `length`: allowed values are exactly `shortest|short|medium|long`, and anything else returns a 400. Sample durations seen:
  - shortest: 26 s
  - short: 60 s
  - medium: 140 s
  - long: 741 s
  - The documented buckets are <30 s, 30 s to 2 min, 2 to 10 min, and >10 min.
- `page_size` (20 max) and `page`.

**Critical gotchas (verified)**

1. **`category=sound_effect` returns 0 results.** Freesound items have `category: null`. For SFX, use `source=freesound&length=shortest` and drop the `category` parameter.
2. **`license_type=commercial` alone lets `by-nd` through.** The first 4 of 5 Jamendo "epic cinematic" hits were BY-ND 3.0. Syncing music to video counts as an adaptation under CC, so ND cannot be used. **Always filter with `license=by,by-sa,cc0,pdm`** (or add `,modification` to `license_type`). Also treat `by-sa` as a flag: the SA clause may arguably reach the rendered video. **[legal judgment, not verified]** Recommended default is `cc0,pdm,by`, with `by-sa` only as an opt-in.

**Response fields**

The result keys, verified:
```
id, title, indexed_on, foreign_landing_url, url, creator, creator_url, license,
license_version, license_url, provider, source, category, genres, filesize, filetype,
tags[{name, accuracy, unstable__provider}], alt_files[{url, filetype,...}], attribution,
fields_matched, mature, audio_set, duration (ms), bit_rate, sample_rate, thumbnail,
detail_url, related_url, waveform, unstable__sensitivity
```

**Formats by source and whether `url` downloads directly**

| source | `filetype` | `url` example | Direct download (HEAD) |
|---|---|---|---|
| jamendo | `mp32` (this is mp3) | `https://prod-1.storage.jamendo.com/?trackid=1076987&format=mp32` | 200, `audio/mpeg`, 4.5 MB. Full track, no key |
| freesound | `mp3` | `https://cdn.freesound.org/previews/351/351256_2247456-hq.mp3` | 200, `audio/mpeg`. This is the **HQ preview** (about 128 kbps **[bitrate UNVERIFIED]**). Fine for SFX |
| freesound `alt_files` | wav/flac | `https://freesound.org/apiv2/sounds/<id>/download/` | **401**, needs Freesound OAuth2. Ignore it |
| wikimedia_audio | ogg, wav, ogx | `https://upload.wikimedia.org/...ogg` | Direct, but send a descriptive `User-Agent`. Mostly classical recordings and spoken words; weak for SFX |

**Attribution:** the API returns a ready-made string, verified:
`"Upbeat Corporate" by Soundrider/Dope is licensed under CC BY 3.0. To view a copy of this license, visit https://creativecommons.org/licenses/by/3.0/.`
Store it in `assets/credits.json`, then render it in an end-credits scene and in `CREDITS.md`. CC0 and PDM items need no credit, but keep the credit anyway for traceability.

**Mood and BPM matching**
- Jamendo items carry `genres` (e.g. `filmscore`, `electronic`, `trailer`) and free-text `tags`: `epic`, `cinematic`, `emotional`, `atmospheric`, `instrumental`, `speed_medium`.
- Openverse has **no BPM field**. The only tempo signal is the tags `speed_low`, `speed_medium` and `speed_high`.
- Strategy: the LLM turns the mood into `q` (e.g. `"cinematic epic instrumental"`), then scores results locally:
  - tag overlap with the mood words;
  - a bonus for `instrumental`;
  - a penalty if `duration` is shorter than the video length;
  - a bonus for the matching `speed_*` tag.
- For **exact BPM**, use ccMixter, or run local beat detection. **[UNVERIFIED option]** `aubio tempo` or `essentia` would add a dependency; skip them unless asked.

## 3. ccMixter fallback (verified, no key)
```bash
curl -s "https://ccmixter.org/api/query?f=json&tags=instrumental,bpm_120_125&lic=by&limit=5"
```
Fields verified in the response:
- `upload_extra.bpm` (e.g. `124`)
- `license_name` ("Attribution (3.0)")
- `license_url`
- `user_real_name`
- `file_page_url`
- `files[].download_url`, a direct mp3 such as `https://ccmixter.org/content/.../..._-_Instrumental.mp3`, with `files[].file_format_info.mime_type = audio/mpeg`

Useful parameters:
- **Tempo:** `bpm_XXX_YYY` tags in steps of 5.
- **Licence:** `lic=by` gives attribution-only. Other values such as `lic=sa` are **[UNVERIFIED]**.
- **Mood:** `tags` values such as `instrumental`, `ambient`, `chill`.

Response time was a few seconds; use a 20 s timeout.

## 4. Alternatives evaluated

| Source | Key? | Verdict |
|---|---|---|
| Freesound API v2 | **Yes**. Search returns `{"detail":"Authentication credentials were not provided."}`; originals need OAuth2 | Use it through Openverse (previews) |
| Jamendo API v3 | **Yes** (`client_id`, free). Returns "Invalid Client Id" | Use it through Openverse |
| Pixabay | **Yes**. `/api/` returns "Invalid or missing API key". The public API covers images and video only, **no audio endpoint** **[per docs]** | No |
| Wikimedia Commons API | No key, User-Agent required. `generator=search&gsrsearch=whoosh filetype:audio&prop=imageinfo&iiprop=url\|mime\|extmetadata` works | Mostly word pronunciations; Openverse already indexes it |
| Incompetech (Kevin MacLeod) | No API. Direct mp3 URLs return 200 with `application/octet-stream` | CC-BY 4.0. Good hand-picked bundle; no search |
| Free Music Archive | API returns 404 (shut down) | No |

## 5. Working curl
```bash
# Music: attribution-safe, 30 s to 2 min
curl -s "https://api.openverse.org/v1/audio/?q=cinematic%20epic%20instrumental&category=music&license=cc0,pdm,by&length=short&page_size=20" \
 | jq '.results[] | {title,url,duration,license,filetype,tags:[.tags[].name],attribution}'
# SFX: NO category param
curl -s "https://api.openverse.org/v1/audio/?q=whoosh&source=freesound&license=cc0,pdm,by&length=shortest&page_size=20" \
 | jq '.results[] | {url,duration,license}'
```

## 6. TypeScript fetch example (Node 18+, stdlib only)
```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const UA = "christopher-nolan/0.1 (+https://github.com/<you>/christopher-nolan)";
const SAFE = "cc0,pdm,by"; // no ND ever; by-sa opt-in

type OvAudio = { id: string; title: string; url: string; duration: number | null;
  license: string; license_version: string; license_url: string; creator: string;
  source: string; filetype: string; attribution: string; foreign_landing_url: string;
  tags: { name: string }[]; genres: string[] | null };

export async function searchAudio(opts: { q: string; kind: "music" | "sfx";
  length?: "shortest" | "short" | "medium" | "long" }): Promise<OvAudio[]> {
  const p = new URLSearchParams({ q: opts.q, license: SAFE, page_size: "20",
    length: opts.length ?? (opts.kind === "sfx" ? "shortest" : "short") });
  if (opts.kind === "music") p.set("category", "music");
  else p.set("source", "freesound"); // category=sound_effect returns 0 (freesound category is null)
  const url = `https://api.openverse.org/v1/audio/?${p}`;
  const cacheFile = `.cache/openverse/${createHash("sha1").update(url).digest("hex")}.json`;
  try { return JSON.parse(await readFile(cacheFile, "utf8")); } catch {}
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429) throw new Error("Openverse rate limit (20/min, 200/day anon) — use ccMixter/bundled");
  if (!res.ok) throw new Error(`Openverse ${res.status}: ${await res.text()}`);
  const results = ((await res.json()).results as OvAudio[]).filter(r => !r.license.includes("nd") && !r.license.includes("nc"));
  await mkdir(".cache/openverse", { recursive: true });
  await writeFile(cacheFile, JSON.stringify(results));
  return results;
}

export function scoreMusic(r: OvAudio, moodWords: string[], minMs: number) {
  const tags = new Set([...r.tags.map(t => t.name.toLowerCase()), ...(r.genres ?? [])]);
  let s = moodWords.filter(w => tags.has(w)).length;
  if (tags.has("instrumental")) s += 2;
  if ((r.duration ?? 0) < minMs) s -= 3; // would need looping
  return s;
}

export async function download(r: OvAudio, dest: string) {
  const res = await fetch(r.url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok || !res.headers.get("content-type")?.startsWith("audio")) // incompetech-style octet-stream: relax if needed
    throw new Error(`download ${res.status} ${res.headers.get("content-type")} ${r.url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return { file: dest, credit: r.attribution, source: r.foreign_landing_url, license: r.license_url };
}
```

## 7. ffmpeg post-processing (verified with the local static ffmpeg build)
```bash
# Duration (seconds)
ffprobe -v error -show_entries format=duration -of csv=p=0 in.mp3      # → 173.609796

# Trim + fades. -vn drops the embedded cover art (Jamendo mp3s have a mjpeg stream that warns)
ffmpeg -y -ss 5 -t 30 -i in.mp3 -vn -af "afade=t=in:d=1,afade=t=out:st=28:d=2" -ar 48000 cut.wav

# Loudness, two-pass (single-pass measured -14.2 LUFS for a -16 target; two-pass gave -15.8)
ffmpeg -i cut.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p' > m.json
ffmpeg -y -i cut.wav -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(jq -r .input_i m.json):measured_TP=$(jq -r .input_tp m.json):measured_LRA=$(jq -r .input_lra m.json):measured_thresh=$(jq -r .input_thresh m.json):linear=true" \
  -ar 48000 -c:a libmp3lame -b:a 192k bed.mp3

# Check
ffmpeg -i bed.mp3 -af ebur128 -f null - 2>&1 | grep -A1 Integrated
```

**Levels and formats**
- **Music bed:** normalize to about -16 LUFS, then lower it further in Remotion (`<Audio volume={0.25}>` or a volume callback for ducking under the voice-over).
- **SFX:** normalize to about -18 LUFS with a short fade-out (`afade=t=out:st=<dur-0.05>:d=0.05`).
- **Format:** output mp3 or wav at 48 kHz; Remotion plays both. Convert Wikimedia `ogg` and `ogx` to mp3 or wav, because browser support for `ogx` is **[UNVERIFIED]**.
- **ffmpeg availability:** do not assume ffmpeg is on PATH on user machines. Remotion bundles an ffmpeg binary, reachable via `npx remotion ffmpeg` / `npx remotion ffprobe` **[verify against the installed Remotion version]**. Use it first, and fall back to the system ffmpeg.

## 8. Pipeline summary
1. The LLM derives the mood words, `q` and the target duration from the scenario.
2. Music:
   - Openverse (`category=music`, `license=cc0,pdm,by`) → score locally → take the top result.
   - If there are none, or on a 429 → ccMixter (`bpm_` tags).
   - If that also fails → bundled track.
3. SFX: Openverse with `source=freesound&length=shortest`, one query per cue (whoosh, click, pop, riser, impact), then the bundled pack as fallback.
4. Download into `public/audio/`, run ffprobe, apply trim, fades and 2-pass loudnorm, and write `credits.json`.
5. Remotion loads files through `staticFile()`. The end-credits scene reads `credits.json`.


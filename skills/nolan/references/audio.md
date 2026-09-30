# Audio: music, SFX, voice, licenses

Base audio needs **no API key**: music and SFX come from free, openly licensed sources, and every file is credited automatically. Fades and ducking happen in Remotion at render time, so you never edit audio files by hand.

## The one command

```bash
nolan audio all <slug>      # = audio music + audio sfx
```

Run it after `scenario.json` validates (it needs the final duration and the sfx cues). Re-run it after big timing changes; files already fetched are reused.

## Music

```bash
nolan audio music <slug>                     # query from scenario.audio.music.mood
nolan audio music <slug> --q "dark ambient synth instrumental"
nolan audio music <slug> --q "..." --pick 2  # take result #2 from the listing
```

- Source order: **Openverse** (Jamendo, Wikimedia, Freesound) → **ccMixter** (has real BPM) → the **bundled bed** in `public/music/` (always works offline).
- The track is trimmed to video length + 2 s when longer, loudness-normalized to -16 LUFS, saved as `public/projects/<slug>/audio/music.mp3`, and `audio.music.src` is set in scenario.json.
- Pick well: `mood` words drive the search. Use 3-5 concrete words (`cinematic`, `ambient`, `pulsing synth`, `instrumental`) rather than adjectives like "good" or "nice". `instrumental` is always a plus: vocals fight on-screen text and voice-over.
- To audition before choosing: `nolan audio search --kind music --q "..." [--length short] [--json]` lists scored results with duration, license and URL. Give the user the top 3 as links if they care about the choice; otherwise take the auto pick, unless `audio music` warns "check this pick with the user" (few candidates, a fallback source, or a title naming another work): then show the pick to the user first.

Music settings in scenario.json (Studio-editable):

| Field | Default | Meaning |
|---|---|---|
| `audio.music.enabled` | true | false = silent bed |
| `audio.music.volume` | 0.5 | bed level without voice |
| `audio.music.duckTo` | 0.2 | bed level under voice-over (8-frame ramps) |
| `audio.music.mood` | [] | search words |
| `audio.music.bpm` | none | optional range, e.g. [90, 110] |

The bed fades in over 1 s and out over 2 s, and loops if shorter than the video.

## SFX

```bash
nolan audio sfx <slug>
```

- **Bundled** (CC0, installed by `nolan setup`): `whoosh`, `whip`, `click`, `switch`, `page-turn`, `shutter` vendored from `@remotion/sfx`, plus our generated `ding`, `riser`, `impact`, `pop`. The list lives in `public/sfx/index.json`.
- Any other name used in a scene's `sfx` is fetched from Freesound via Openverse (shortest clips), normalized and stored as `public/projects/<slug>/audio/sfx-<name>.mp3`, with a credit entry.

**Auto cues** (`audio.sfx.auto: true`, the default) need nothing from you:

| Event | Sound |
|---|---|
| every cut | whoosh, 5 frames before the cut |
| title and outro start | impact |
| first scene after a title | riser ending on it |
| code / terminal typing | click bursts (max 1 per 3 frames) |
| stats landing | ding |

Add **explicit** cues only for moments the auto rules miss: `"sfx": [{ "name": "shutter", "at": 0.4 }]` on an image scene, a `whip` on a beat-synced `none` cut. Keep at most one "hero" sound (impact, riser) every 3 s.

SFX density from the grill maps to: **none** → `audio.sfx.enabled: false`; **subtle** → `auto: true`, `volume: 0.35`; **rich** → `auto: true`, `volume: 0.5` + a few explicit cues.

## Voice-over (optional, OpenRouter key)

```bash
nolan ai status                         # key? budget left?
nolan ai tts <slug> --dry-run           # estimate only, spends nothing
nolan ai tts <slug> [--voice V] [--model M] [--scene ID]
```

- Only for scenes with `narration`. Writes `public/projects/<slug>/voice/<sceneId>.mp3`, sets `voiceSrc`, and lengthens a scene to voice + 0.6 s when needed. Re-run `nolan validate <slug>` after it.
- Cost: a 60 s script (~150 words, ~900 characters) costs cents, not dollars, with the default model; the ledger reserves an estimate before each call. Announce the estimate and wait for a yes. Details: `references/openrouter.md`.
- The music ducks to `duckTo` under every voice line automatically.

## Licenses and credits (read this)

- Accepted by default: **CC0**, **public domain (pdm)**, **CC BY**. CC BY-SA only when the user opts in (`audio search --allow-sa`), because it asks the whole video to be shared under the same license. **NC and ND are always rejected** (NC forbids commercial use, ND forbids editing such as trimming).
- Every downloaded file gets an entry in `public/projects/<slug>/assets.lock.json`: `{id, kind, file, title, creator, license, licenseUrl, attribution, sourceUrl, provider}`.
- The outro scene scrolls these credits automatically, and `nolan render` prints them. **CC BY requires the credit**: never remove the outro or the credits when a CC BY track is used. Also paste the credits into the video description when publishing.
- `@remotion/sfx` sounds and the bundled pack need no attribution.
- AI-generated music (`nolan ai music`, experimental) follows the model provider's terms; say so to the user if they choose it.

## Mix targets (for reference, already applied)

Master around -14 LUFS (YouTube normalizes to it), music bed -16 LUFS, voice -16 LUFS with the bed ducked ~12-15 dB underneath, SFX peaks 6-10 dB under the mix.

## Troubleshooting

| Problem | Fix |
|---|---|
| `429` from Openverse (20/min, 200/day anonymous) | wait 60 s; results are cached in `.cache/openverse/`; ccMixter and the bundled bed kick in automatically |
| wrong vibe | new `--q` with more precise words, or `audio search` + `--pick N` |
| music too loud under text | lower `audio.music.volume` in Studio (0.35-0.45) |
| no ffmpeg on PATH | fine: Remotion's bundled ffmpeg is used |

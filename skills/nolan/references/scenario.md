# Scenario: writing `projects/<slug>/scenario.json`

The scenario is the whole video as data. Remotion renders it, Studio edits it, the CLI validates it (`src/schema.ts`, zod). Write it by hand, scene by scene, from the confirmed grill summary. Then `nolan validate <slug>`.

## Top level

```json
{
  "slug": "my-video",                 // = project slug, a-z 0-9 -
  "title": "My Video",
  "format": "16:9",                   // "16:9" 1920x1080 | "9:16" 1080x1920 | "1:1" 1080x1080
  "fps": 30,
  "theme": {
    "preset": "interstellar",         // interstellar | neon-terminal | editorial-light | brutalist | retro-crt | clean-dark
    "accent": "#D9A441",              // optional overrides (use at most 3)
    "background": "#07080A", "text": "#E8E4DA",
    "displayFont": "Bebas Neue", "bodyFont": "Inter", "monoFont": "JetBrains Mono",   // Google Fonts family names
    "grain": 0.15,                    // 0..1
    "energy": "medium"                // calm | medium | punchy (motion springs)
  },
  "transition": { "type": "fade", "frames": 20 },   // default cut; fade slide wipe flip none dreamyZoom filmBurn blurSlide
  "audio": {
    "music": { "enabled": true, "volume": 0.5, "duckTo": 0.2, "mood": ["cinematic", "ambient"], "bpm": [90, 110] },
    "sfx":   { "enabled": true, "auto": true, "volume": 0.5 },
    "voice": { "enabled": true, "volume": 1 }
  },
  "scenes": [ ... ]
}
```

- SFX density from the grill: **none** → `sfx.enabled: false`; **subtle** → `auto: true`, `volume: 0.35`; **rich** → `auto: true`, `volume: 0.5` + a few explicit cues.
- `audio.music.src`, `scene.voiceSrc` and credits are filled by the CLI (`audio`, `ai tts`). Don't invent paths.
- Keys starting with `_` (`_tokens`, `_credits`) are derived at render time. Never write them.
- Comments above are for this doc only: scenario.json is plain JSON.

## Scene fields

Common to every scene:

| Field | Meaning |
|---|---|
| `id` | unique, short, kebab-case (`hook`, `code-1`) |
| `type` | one of the 12 types below |
| `seconds` | on-screen time, 0.5-600 (transitions overlap it, see Timing) |
| `transition` | overrides the cut **after** this scene |
| `narration` | voice-over text (with `ai tts`) |
| `background` | image path under `public/` (optional) |
| `sfx` | explicit cues `[{ "name": "whoosh", "at": 1.2, "volume": 0.4 }]`, `at` in seconds from scene start |

Per type (use only the fields listed; others are ignored):

| Type | Fields | Use for | Limits |
|---|---|---|---|
| `title` | `title`, `subtitle` | name sting, reveal | title ≤ 4 words |
| `kinetic` | `text` | hook, punchline, one strong sentence | ≤ 12 words |
| `code` | `code`, `lang`, `filename`, `highlight` ("3-5,8"), `typing` (default on; `false` = shown at once), `title` | the real code | ≤ 18 lines (9:16: ≤ 24 lines), ≤ 80 chars/line (9:16: ≤ 40) |
| `tree` | `tree` (paths), `focus`, `title` | repo layout | ≤ 25 paths |
| `diagram` | `nodes` [{id,label,col,row}], `edges` [{from,to,label?}], `title` | architecture, flow | ≤ 6 nodes, labels ≤ 3 words |
| `terminal` | `commands` [{cmd, output?}], `title` | install, demo run | ≤ 3 commands, ≤ 6 output lines each |
| `stats` | `stats` [{label, value, prefix?, suffix?}], `title` | proof, numbers | ≤ 3 stats, `value` is a number |
| `bullets` | `title`, `bullets` | problem, features | ≤ 4 bullets, ≤ 7 words each |
| `quote` | `quote`, `author` | testimonial, manifesto | ≤ 25 words |
| `image` | `image`, `title`, `subtitle` | screenshot (Ken Burns) | image under `public/` |
| `compare` | `before`, `after`, `title` | before/after | one short line each, or two image paths (wipe) |
| `outro` | `title`, `cta`, `url` | CTA + credits (auto from assets.lock.json) | always last |

Diagram grid: `col` 0-3 left to right, `row` 0-2 top to bottom. A flow of 4 steps is `col` 0,1,2,3 on `row` 0. In 9:16 use a single column (`col` 0, `row` 0..n) since diagrams stack vertically.

## Timing

- 30 fps. `seconds × 30` = frames per scene.
- Each cut overlaps the two scenes by `transition.frames` (default 20 = 0.67 s), so **total = Σ seconds − Σ overlaps**. `nolan validate` prints the exact total; aim within ±2 s of the target.
- A `none` cut has no overlap. Use it for hard, punchy cuts.
- **Reading time:** every text must stay on screen at least `max(1.5 s, words / 3.5)` after it has fully appeared. Add ~1 s for the reveal animation. Code: ~1 s per 2 lines when typing, plus 2 s to read the highlight.
- With voice-over, `ai tts` extends a scene to voice length + 0.6 s. Write narration at ~2.5 words/s: a 6 s scene holds ~15 words.

## Structures (start from one, then adapt)

**Repo explainer, ~60 s, 16:9:**

| # | Scene | s | Type |
|---|---|---|---|
| 1 | Hook: bold claim or pain | 3 | kinetic |
| 2 | Title sting | 3 | title |
| 3 | Problem | 6 | bullets or compare |
| 4 | Reveal the product | 4 | title or image |
| 5 | Code walkthrough (2-3 steps) | 12-15 | code (one scene per step) |
| 6 | Architecture | 8 | diagram or tree |
| 7 | Demo | 8 | terminal or image |
| 8 | Proof | 5 | stats or quote |
| 9 | CTA + credits | 5-6 | outro |

**Teaser, ~30 s:** scenes 1, 2, 4, 5 (one step), 8, 9.

**Deep dive, 2-3 min:** repeat 5-7 per module, one bullets scene as a chapter card between modules.

**Vertical 9:16, 20-45 s:** the hook is the first scene, a `kinetic` of ≤ 5 words held 2.5 s (the reading-time rule's minimum), or the title itself. Text scenes (title, kinetic, bullets, quote, stats, image, compare) 2-4 s; code, terminal, diagram and tree 5-7 s (1-2 commands, typed code ≤ 10 lines); outro 4-6 s. Text sits in the central safe zone automatically, so keep lines short (≤ 24 chars for titles); code at ≤ 24 lines of ≤ 40 chars (`typing: false` above 10); diagrams in one column; shorter cuts (`transition.frames` 12); SFX can be denser. `nolan validate` checks these limits.

**Vertical teaser, ~30 s, 9:16** (transition 12 frames, 6 cuts ≈ 2.4 s of overlap):

| # | Scene | s | Type |
|---|---|---|---|
| 1 | Hook, ≤ 5 words | 2.5 | kinetic |
| 2 | Title sting | 3 | title |
| 3 | Problem | 4 | bullets (≤ 3) or compare |
| 4 | The code, one step | 7 | code (≤ 10 lines typed) |
| 5 | Demo | 6 | terminal (1-2 commands) |
| 6 | Proof | 4 | stats |
| 7 | CTA + credits | 5 | outro |

**1:1:** same as 16:9 but shorter lines; ≤ 3 bullets.

## Authoring rules

1. **One idea per scene.** If a scene needs two sentences to explain, split it.
2. **Real material only.** Code comes from the repo (copy an excerpt verbatim, trim to ≤ 18 lines, keep indentation). Commands are the real install/run commands. Numbers come from repo-facts.json. Never invent a stat.
3. **Hook first.** The first scene must work muted, in 3 s: big type, one claim.
4. **Rhythm:** alternate dense and airy scenes (code → kinetic → diagram). No more than 2 text-heavy scenes in a row.
5. **Highlight** the 1-3 lines that matter in code scenes. Typing is **on by default**; set `"typing": false` for code over 10 lines (typing is slow).
6. **Transitions:** keep the preset's default; use `filmBurn`/`dreamyZoom` at most twice per video (reveal, outro); `none` for beat-synced punches.
7. **Outro last**, always, with `cta` and `url`. Credits are added automatically; never remove the outro when CC-BY audio is used.
8. **Narration** (if voice-over): write for the ear, short sentences, no code read aloud; on-screen text must not duplicate the narration word for word.
9. **Language:** all on-screen text and narration in the audience's language.

## Picking a preset

| Preset | Look | Motion | Default cut | Music moods | Best for |
|---|---|---|---|---|---|
| `interstellar` (default) | near-black, warm off-white, amber accent; Cinzel / Inter / JetBrains Mono; grain + vignette | slow, no overshoot | fade 20 | cinematic, ambient, pulsing synth, 90-110 bpm | trailers, launches, "epic" |
| `neon-terminal` | dark blue-black, mint text, neon green + magenta; Space Grotesk / Fira Code | snappy | slide 12 | synthwave, cyberpunk, 110-128 | dev tools, CLIs, hacker vibe |
| `editorial-light` | cream paper, black ink, orange accent; Instrument Serif / Manrope | smooth, calm | wipe 15 | minimal, piano, lofi, 80-100 | docs, essays, calm explainers |
| `brutalist` | white, black, red-orange; Archivo Black / Space Mono; radius 0 | hard, fast | none (hard cuts) | industrial, breakbeat, glitch, 120-140 | bold opinions, manifestos |
| `retro-crt` | purple night, amber text, pink accent; Press Start 2P / VT323; scanlines | stepped (8 steps) | fade 8 | chiptune, 8-bit, 120-150 | games, fun side projects |
| `clean-dark` | SaaS black, white, violet accent; Geist | medium | blurSlide 15 | tech, upbeat electronic, 100-120 | products, startups, SaaS |

- Set `transition` to the preset's default cut unless the grill decided otherwise (the schema default is `fade 20`).
- Set `audio.music.mood` to 3-5 words: the preset's moods refined by inspiration.json. Add `bpm` when known.
- Overrides: at most 3 of `accent`, `displayFont`, `energy` (or `background`/`text` to match a brand). Check contrast: text vs background ≥ 4.5:1.
- Fonts must be Google Fonts family names (e.g. `"Space Grotesk"`, not a file).

## Minimal valid example

```json
{
  "slug": "hello",
  "title": "Hello",
  "theme": { "preset": "clean-dark" },
  "transition": { "type": "blurSlide", "frames": 15 },
  "audio": { "music": { "enabled": true, "volume": 0.5, "duckTo": 0.2, "mood": ["tech", "upbeat electronic"] } },
  "scenes": [
    { "id": "hook", "type": "kinetic", "seconds": 3, "text": "Ship the video, not the timeline." },
    { "id": "install", "type": "terminal", "seconds": 5, "commands": [{ "cmd": "npx hello init", "output": "✓ ready" }] },
    { "id": "outro", "type": "outro", "seconds": 5, "title": "Hello", "cta": "Star it on GitHub", "url": "github.com/you/hello" }
  ]
}
```

A complete ~45 s example: `projects/christopher-nolan-trailer/scenario.json` in the workspace.

## Checklist before `nolan validate`

- [ ] total duration within ±2 s of the grill target
- [ ] every text passes the reading-time rule
- [ ] ≤ 4 bullets, ≤ 18 code lines (9:16: 24), ≤ 3 stats, ≤ 6 diagram nodes (`nolan validate` warns on each type limit)
- [ ] code, commands and numbers are real
- [ ] outro last with `cta` and `url`
- [ ] `audio.music.mood` set (or music disabled on purpose)

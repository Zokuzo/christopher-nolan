# Brief: design and motion for code and product videos, and how the agent collects inspiration

What I checked live on 2026-09-30: all `remotion` and `@remotion/*` packages are at **4.0.530** (same version across the monorepo, so pin them all exactly with no `^`). Also `shiki@4.4.3`, `codehike@1.1.0` and `@code-hike/lighter@1.0.3`. `@remotion/light-leaks` is now **deprecated**: the Remotion docs list `@remotion/effects` in its place. `@remotion/transitions` exports `TransitionSeries` (`.Sequence`, `.Transition`, `.Overlay`), `linearTiming`, `springTiming`, plus these presentations: fade, slide, wipe, flip, clock-wipe, iris, none, and the newer `blurSlide`, `crossZoom`, `dreamyZoom`, `filmBurn`, `linearBlur`, `pushCut`, `ripple`, `swap`, `zoomInOut`, `crosswarp`, `bookFlip`, `dissolve`. The default `spring()` config is `{damping:10, mass:1, stiffness:100, overshootClamping:false}`.

## 1. Video structures (30fps)

**Repo explainer, about 60s at 16:9 (1920x1080), 1800 frames:**

| # | Scene | Seconds | Frames | Library scene |
|---|---|---|---|---|
| 1 | Hook (a bold claim or a pain point) | 3 | 90 | kinetic-text |
| 2 | Title/logo sting | 3 | 90 | title-card (impact SFX) |
| 3 | Problem | 6 | 180 | bullet-reveal or split-compare ("before") |
| 4 | Reveal (the product) | 4 | 120 | title-card or screenshot (riser into impact) |
| 5 | Code walkthrough | 12–15 | 360–450 | code-block (2–3 steps of 4–5s) |
| 6 | Architecture | 8 | 240 | arch-diagram |
| 7 | Demo | 8 | 240 | terminal or screenshot with Ken Burns |
| 8 | Stats and social proof | 5 | 150 | stats-counter or quote |
| 9 | CTA and credits | 5–6 | 150–180 | outro-credits |

- **Transitions:** 12–20 frames each (`linearTiming({durationInFrames:15})`). A `TransitionSeries` overlap shortens the total runtime, so the agent must compute `total = Σscenes − Σtransitions`.
- **Other lengths:** 30s teaser is scenes 1, 2, 4, 5 (one step), 8, 9. A 2–3 min deep dive repeats scenes 5 to 7 for each module.
- **9:16 vertical (1080x1920):** hook in the first 1.5s (45 frames). Each scene is at most 4s. Text sits in the central 1080x1350 safe zone (top 220 and bottom 350 px stay clear for platform UI). Code uses 16–24 visible lines at 38–44px mono. Diagrams stack vertically. Target 20–45s.
- **Implementation:** one `layout` token (`"16:9" | "9:16" | "1:1"`) chosen in `calculateMetadata`. Scenes read `useVideoConfig().width/height`. Do not build separate components per format.
- **Safe margins at 16:9:** 96px horizontal and 72px vertical (title-safe is about 5%).
- **Reading time:** give text at least `max(1.5s, words/3.5 s)` on screen after it has fully revealed.

## 2. Scene library (each is a React component plus a zod schema, so props can be edited in Studio)

Every scene gets `theme` from context and its own `z.object` schema. `@remotion/zod-types` provides `zColor()`, which makes color props show as color pickers in Remotion Studio.

1. **TitleCard.** Scale 1.08→1 with a spring `{damping:200}` (no overshoot). Letter-spacing 0.3em→0.05em over 40 frames. Film-grain overlay from `@remotion/noise`. Impact SFX at frame 0.
2. **KineticText.** Split into words and stagger 3–4 frames per word: `translateY 40→0`, `opacity`, `blur 8→0px`. Measure fit with `fitText()` from `@remotion/layout-utils`.
3. **CodeBlock.** Two options:
   - Tokenize with `shiki` using `codeToTokens(code,{lang,theme})`, then type out with `slice(0, floor(interpolate(frame,[s,e],[0,len])))`. Type at about 25–40 chars/s. The caret blinks on a 16-frame period while idle.
   - Or morph between steps with Code Hike (official template: `remotion-dev/template-code-hike`).
   - Line highlight: non-focused lines drop to opacity 0.35, and the focused line gets a background at `accent/12%`. Focus moves with a spring. Use `mouseClick` SFX in bursts of at most one per 3 frames. Never one click per character: it sounds like noise.
4. **FileTree.** Nodes revealed depth-first, 2 frames apart. Open folders rotate their chevron. The highlighted path is in the accent color. Data comes from `git ls-files`, limited to 25 visible nodes.
5. **ArchDiagram.** Nodes are rounded rects that pop in with a spring. Edges are SVG paths drawn with `evolvePath(progress, d)` from `@remotion/paths`. A travelling "packet" dot uses `getPointAtLength`. Layout is precomputed by the agent (rank/column grid). The ELK/dagre layout libraries are optional and not verified here.
6. **Terminal.** Window chrome (3 dots), a `$ ` prompt typed at 20 chars/s, and output lines appearing instantly in blocks of 1–3 lines every 4 frames. `mouseClick` on Enter. Cursor rendered as a block █.
7. **StatsCounter.** `interpolate(frame,[0,45],[0,value],{easing:Easing.out(Easing.cubic)})` with `Intl.NumberFormat`. Up to 3 stats, staggered 8 frames. `ding` SFX when a counter lands (optional).
8. **BulletReveal.** At most 4 bullets, one every 20–30 frames. Slide in from x −24px. The marker is drawn with the accent color.
9. **Quote.** Serif, 56–72px. Words are unblurred progressively. Attribution fades in 20 frames later.
10. **Screenshot with Ken Burns.** Scale 1.0→1.12 plus a 2–4% translate over the whole scene, linear or `Easing.inOut(Easing.sin)`. Browser-frame chrome is optional. Optional focus zoom onto a rect with a spring.
11. **SplitCompare.** Before/after with a wipe divider driven by `interpolate`. Labels reading "Before" and "After" in the accent color.
12. **OutroCredits.** Logo spring, CTA (repo URL), then a scrolling credits list that is **generated from `assets.lock.json`**: title, author, license and URL for every music track and SFX. This is required for CC-BY tracks.

Transitions between scenes use `TransitionSeries.Transition` (fade or `slide({direction:"from-right"})` by default). For the cinematic preset use `filmBurn`/`dreamyZoom` sparingly (at most 2 per video). SFX that must line up with a transition go in `TransitionSeries.Overlay` or in a `<Sequence from>` placed at the transition frame.

## 3. Theme system

```ts
type Theme = {
  name: string;
  color: { bg: string; surface: string; text: string; muted: string; accent: string; accent2: string; codeTheme: string /* shiki theme id */ };
  font: { display: string; body: string; mono: string }; // @remotion/google-fonts slugs
  radius: number; grain: number /*0-1*/; vignette: number;
  motion: { spring: {damping:number; stiffness:number; mass:number}; ease: [number,number,number,number]; stagger: number /*frames*/; transition: {type:string; frames:number} };
  music: { moods: string[]; bpm: [number, number] };
};
// font loading (verified exports: loadFont, loadVariableFont, getInfo, fontFamily)
import { loadFont } from "@remotion/google-fonts/Inter";
const { fontFamily } = loadFont("normal", { weights: ["400","700"], subsets: ["latin"] });
```

**Presets** (all font slugs confirmed to exist in `@remotion/google-fonts@4.0.530`):

| Preset | bg / text / accent | Fonts (display / body / mono) | Motion | Code theme | Music moods |
|---|---|---|---|---|---|
| **interstellar** (default, "Nolan") | `#07080A` / `#E8E4DA` / `#D9A441` (amber), accent2 `#5B7C99` | Cinzel or BebasNeue / Inter / JetBrainsMono | spring `{damping:200,stiffness:80}`, ease `[0.16,1,0.3,1]`, stagger 5, `fade` 20f, grain 0.15, vignette 0.5 | `vitesse-dark` | cinematic, ambient, pulsing synth, organ drone, Zimmer-like, 90–110bpm |
| **neon-terminal** | `#0A0E14` / `#C7F9CC` / `#39FF88`, accent2 `#FF2BD6` | SpaceGrotesk / Inter / FiraCode | `{damping:14,stiffness:160}`, stagger 2, `slide` 12f | `github-dark` | synthwave, cyberpunk, electronic, 110–128 |
| **editorial-light** | `#F7F5F0` / `#111111` / `#E4572E` | InstrumentSerif / Manrope / IBMPlexMono | `{damping:200,stiffness:120}`, ease `[0.65,0,0.35,1]`, `wipe` 15f, radius 4 | `github-light` | minimal, piano, lofi, corporate-light, 80–100 |
| **brutalist** | `#FFFFFF` / `#000000` / `#FF3B00` | ArchivoBlack / SpaceMono / SpaceMono | `{damping:30,stiffness:300}` (snappy), hard cuts, `none` or `pushCut`, radius 0 | `min-light` | industrial, breakbeat, glitch, 120–140 |
| **retro-crt** | `#1B1026` / `#FFE8A3` / `#FF6AD5` | PressStart2P (titles only) / VT323 / VT323 | stepped ease (`Math.floor(p*8)/8`), scanline overlay | `dracula` | chiptune, 8-bit, retrowave, 120–150 |
| **clean-dark** (SaaS) | `#0B0B0F` / `#FAFAFA` / `#7C5CFF` | Geist / Geist / GeistMono | `{damping:20,stiffness:120}`, `blurSlide` | `vesper` | tech, upbeat electronic, future bass, 100–120 |

Shiki theme ids (`vitesse-dark`, `vesper`, etc.) are from memory. Before shipping, validate them against `bundledThemes` in shiki 4.

## 4. How the host agent gathers inspiration (no keys: it uses the host's own WebSearch/WebFetch)

**Search queries** (the agent fills in `{topic}` and `{style}`):
- `"{topic}" product launch video motion design 2026`
- `site:dribbble.com {style} motion ui dark`
- `site:behance.net {topic} explainer video styleframes`
- `site:awwwards.com {style} website typography` (for type and palette)
- `site:vimeo.com {topic} product launch video` and `"launch video" {similar-product}`, which finds references like the launch videos for Linear, Vercel Ship, Raycast or Arc
- `site:youtube.com {language/framework} in 100 seconds` (Fireship format: fast, dense code)
- Motion galleries: `site:motionographer.com` and `site:mobbin.com`.

Dribbble/Behance often block WebFetch or render client-side. Rely on the search snippets plus page `<meta>`/`og:image` alt text, and do not treat a failed fetch as an error.

**Distillation protocol** (the agent writes `inspiration.json`):
1. Collect 5–8 references as `{url, why}`.
2. Extract named traits: palette (hex values when visible, otherwise named colors), type category (grotesk, serif or mono), motion energy (calm, medium or punchy), cut rate (seconds per shot), texture (grain, glow, flat).
3. Map to the **closest preset**, then override at most 3 tokens (accent, display font, motion energy). Energy maps to springs: calm `{damping:200}`, medium `{damping:20,stiffness:120}`, punchy `{damping:12,stiffness:220}`.
4. Emit `music: {moods:[3–5 keywords], bpm:[lo,hi], instruments:[...], avoid:[...]}`. These feed the music-search step, for example "cinematic, ambient, pulsing synth, no vocals, 95–110bpm".
5. Validate: text/bg contrast must be ≥ 4.5:1, computed inline with the WCAG formula. If it fails, fall back to the preset's text color.

**Grill-me hooks** (questions to put to the user): which of 3 preset thumbnails, 16:9 or 9:16, target length, what the hook is, which single metric to show, CTA URL.

## 5. SFX and mix

**`@remotion/sfx@4.0.530`** (verified) exports hosted URLs: `whoosh`, `whip`, `mouseClick`, `uiSwitch`, `ding`, `pageTurn`, `shutterModern`, `shutterOld`, `vineBoom`, `recordScratch`, and meme sounds that should stay excluded by default. The docs say each is **normalized to a −3 dB peak** and usable **without attribution**. They are served from `https://remotion.media/*.wav` (HTTP 200 confirmed). Vendor them into `public/sfx/` at install time so renders work offline.

The package has **no riser, impact, boom, glitch or typing loop**. Those must come from the SFX sourcing module (CC0 sources). Until then, `vineBoom` could stand in for a low impact, but that is not recommended for the cinematic preset.

**Cue rules** (generated from the scene timeline, stored in `cues.json`, each cue editable):

| Event | SFX | Timing | Volume (linear) |
|---|---|---|---|
| Scene transition | whoosh or whip | start 4–6 frames **before** the cut | 0.35–0.5 |
| Title or reveal | impact/boom | exactly at the reveal frame | 0.6–0.8 |
| Before a reveal | riser | ends on the reveal frame, 1.5–3s long | ramps 0→0.5 |
| Typing | mouseClick | at most 1 per 3 frames, jitter ±1 frame, playbackRate 0.9–1.1 | 0.15–0.25 |
| Counter lands, checkmark | ding or uiSwitch | on the land frame | 0.3 |
| Screenshot pop | shutterModern | on appear | 0.3 |

Keep at most one "hero" SFX every 3s. In 9:16 the density can double.

**Mix targets** (sources below):
- Final master: **−14 LUFS integrated, −1 dBTP**. YouTube normalizes down to −14 and never turns quiet content up.
- Music bed with no voice: about −16 to −18 LUFS (volume about 0.5–0.6 when the track itself is mastered around −10 to −12).
- Voice-over (OpenRouter TTS path): −16 LUFS. The music under voice sits about 12–15 dB lower (−28 to −30 LUFS), i.e. a volume multiplier of about 0.2.
- SFX: peaks −6 to −10 dBFS relative to the mix.

Implementation (Remotion `volume` accepts a per-frame callback):
```tsx
const duck = (f:number) => voiceRanges.some(([s,e]) => f>=s-8 && f<=e+8) ? 0.2 : 0.55;
<Audio src={staticFile("music/bed.mp3")} volume={(f) =>
  duck(f) * interpolate(f,[0,30,dur-60,dur],[0,1,1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})} loop />
```

For duck ramps, interpolate over 8 frames rather than stepping. The step version above is simplified.

Loudness measurement can be done after rendering with `ffmpeg -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json` (two-pass). Remotion ships ffmpeg via `npx remotion ffmpeg`; check that this command exists in 4.0.530 before relying on it.

## Uncertain (verify before building)
- The replacement API for light leaks in `@remotion/effects`: exact props not checked.
- Shiki 4 theme ids and whether the `codeToTokens` signature changed in the 4.x major.
- Whether `npx remotion ffmpeg` is available.
- The "−18 LUFS bed" figure is an industry rule of thumb, not a published standard. Only −14 LUFS / −1 dBTP is documented, by YouTube.

Sources: [remotion.dev/docs/sfx](https://www.remotion.dev/docs/sfx), [unpkg @remotion/* 4.0.530 typings](https://unpkg.com/@remotion/transitions@4.0.530/dist/index.d.ts), [Critical Listening Lab: YouTube loudness](https://www.criticallisteninglab.com/en/learn/loudness/youtube), [audioforgepro: YouTube LUFS guide](https://audioforgepro.com/blog/youtube-lufs-normalization-guide), [pureaudioinsight: YouTube audio levels](https://pureaudioinsight.com/blogs/content-production/perfect-youtube-audio-levels-creators-technical-guide), [remotion-dev/template-code-hike](https://github.com/remotion-dev/template-code-hike), [remotion-dev/typewriter](https://github.com/remotion-dev/typewriter), [Code Hike docs](https://codehike.org/docs)
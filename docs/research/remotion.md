# Remotion brief for Christopher Nolan (checked 2026-09-30)

Sources checked on 2026-09-30:
- `npm view` for the versions.
- Raw docs files in `remotion-dev/remotion/main/packages/docs/docs/*`.
- Studio-server source.
- The `remotion-dev/skills` repo.

## 0. Versions
- `npm view remotion version` gives **4.0.530**, published 2026-09-29.
  - dist-tags: `latest 4.0.530`, `alpha 4.1.0-alpha12`.
  - There is no v5 on npm. The docs already mention v5 deprecations, for example `layout="none"` will throw in 5.0.
- These packages are all at **4.0.530**, and every `@remotion/*` version must be pinned to the same exact number: `remotion`, `@remotion/cli`, `@remotion/studio`, `@remotion/zod-types`, `@remotion/transitions`, `@remotion/google-fonts`, `@remotion/media`, `@remotion/shapes`, `@remotion/layout-utils`, `@remotion/sfx`, `create-video`.
- Zod: **`zod@4.5.4`**.
  - `@remotion/zod-types` has used Zod v4 since v4.0.426.
  - `@remotion/zod-types-v3` exists for zod 3.22.3.
  - `@remotion/media` has `zod 4.5.4` as a direct dependency.
  - The official templates use React 19.2.3, TypeScript 5.9.3 and `@types/react` 19.2.7.

## 1. Scaffolding (non-interactive)
```bash
npx create-video --yes --blank my-video          # --yes requires a template flag + dir
# flags: --no-tailwind (with --yes), --tmp
# template ids: blank, hello-world, code-hike, still, audiogram, music-visualization,
#   prompt-to-video, tiktok, overlay, three, skia, stargazer, render-server, next, ...
```
Recommendation: skip `create-video`. Ship our own `package.json` in the repo; it is deterministic and agent-friendly.
```json
{
  "scripts": { "studio": "remotion studio", "render": "remotion render" },
  "dependencies": {
    "remotion": "4.0.530", "@remotion/cli": "4.0.530", "@remotion/studio": "4.0.530",
    "@remotion/zod-types": "4.0.530", "@remotion/transitions": "4.0.530",
    "@remotion/google-fonts": "4.0.530", "@remotion/media": "4.0.530",
    "@remotion/shapes": "4.0.530", "@remotion/layout-utils": "4.0.530",
    "@remotion/sfx": "4.0.530", "zod": "4.5.4",
    "react": "19.2.3", "react-dom": "19.2.3",
    "codehike": "1.0.4", "@code-hike/lighter": "1.0.3"
  },
  "devDependencies": { "typescript": "5.9.3", "@types/react": "19.2.7" }
}
```
- The entry point is `src/index.ts`, which calls `registerRoot(RemotionRoot)`.
- `npx remotion add zod` installs a matching zod version.
- `npx remotion upgrade` bumps all Remotion packages together.

## 2. Studio props editing and saving to disk (most important section)
How saving works, verified in the studio-server source (`routes/update-default-props.ts`):
- Studio saves props only into the **single root file**, the file that contains `registerRoot`'s component.
- That file must be **TypeScript**, and `defaultProps` must be an **inline object literal** on `<Composition>`.
- It throws `"Cannot update Root file if not using TypeScript"`.

Behaviour of the props panel:
- **Since v4.0.437, every prop change is written to disk immediately.** There is no longer an "unsaved props" state. The save button and the undo button still exist.
- A `schema` (a `z.object` at the top level) takes precedence over controls inferred from `defaultProps`. Inference has existed since 4.0.516.
- Controls exist for: object, string, date, number, boolean, array, enum, optional, nullable, 2-type union with null or undefined, `.min/.max/.step`, `zColor()`, `zTextarea()`, `zMatrix()`, and `z.string()` paths used with `staticFile()`.
- The Props panel also has a JSON editing mode. Invalid JSON is not applied.

Programmatic APIs from `@remotion/studio`. They work only while Studio is running and throw everywhere else:
- `saveDefaultProps({compositionId, defaultProps: ({savedDefaultProps, schema}) => ({...savedDefaultProps, x})})`. Available since 4.0.147. zod must be installed.
- `writeStaticFile({filePath:'projects/foo/scenario.json', contents: string|ArrayBuffer})`.
  - The path is relative to `public/`.
  - Writing outside `public/` is not allowed.
  - Use forward slashes, including on Windows.
- `watchStaticFile(name, cb)` returns `{cancel}`.
- `getStaticFiles()` returns `[{name, src, ...}]`. The code-hike template uses it to read files from `public/`.

**Recommended pattern.** `scenario.json` stays the file agents edit, and generated code is the file Studio edits.
1. The source of truth is `projects/<slug>/scenario.json`, with a Zod `ScenarioSchema` in `src/schema.ts`.
2. `nolan studio <slug>` regenerates `src/Root.tsx`. It writes the scenario as an inline literal: `defaultProps={ {...JSON.stringify(scenario)...} }` together with `schema={ScenarioSchema}`, one `<Composition>` per active project. It then runs `npx remotion studio --port=3123`.
3. Studio edits auto-save into `Root.tsx`.
4. `nolan sync <slug>` pulls the edits back into `scenario.json`. Two ways to do it:
   - **Robust:** `bundle()` + `getCompositions()` / `selectComposition()` from `@remotion/renderer`, then read `.defaultProps`, which is returned since v2.5.7. It needs a bundle, so it takes a few seconds.
   - **Fast (uncertain, test first):** a Studio-only effect in the component. Guard it with `getRemotionEnvironment().isStudio`, debounce it, and call `writeStaticFile({filePath:\`projects/${slug}/scenario.json\`, ...})`. This mirrors props to `public/`. Keep the scenario out of `public/` otherwise, so the write does not trigger a reload loop.
5. Rendering uses `--props=projects/<slug>/scenario.json` (a file path), so re-rendering works even without the generated Root.

Do not import the JSON into `defaultProps`. A non-inline value makes saving silently unavailable.

Caveat on timeline editing (verified). **Studio interactivity** (≥4.0.475) writes canvas and timeline edits back to code: drag and scale `<Sequence>` elements, keyframes in `interpolate()`, and volume keyframes (press `V`, 4.0.530). It only edits **literal code**. When sequences are generated from scenario data, only the Props panel edits persist. Two acceptable ways to handle it:
- Accept this and document it.
- Let the agent "eject" a scene into literal TSX when the user wants to fine-tune it on the timeline.

## 3. calculateMetadata (dynamic duration)
```ts
import {CalculateMetadataFunction} from 'remotion';
export const calcMeta: CalculateMetadataFunction<Scenario> = async ({props, abortSignal, isRendering}) => {
  const fps = 30;
  const frames = props.scenes.reduce((a, s) => a + Math.round(s.seconds * fps), 0)
    - (props.scenes.length - 1) * props.transitionFrames;   // TransitionSeries overlaps
  return { durationInFrames: frames, fps, props: {...props /* + derived, e.g. highlighted code */} };
};
```
- It runs once per render (in a separate tab) and again on every Studio props change.
- It may be async and must resolve within the delayRender timeout, 30 s by default.
- It returns JSON-serializable data. `props` must have the same shape as the input.
- Other return fields: `width`, `height`, `defaultCodec`, `defaultOutName`, `defaultPixelFormat`, `defaultSampleRate`.
- Props transformed here are **not** saved back into `Root.tsx`, which is what we want for derived data.

## 4. Transitions
```tsx
import {TransitionSeries, linearTiming, springTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';   // slide({direction:'from-left'})
import {wipe} from '@remotion/transitions/wipe';
<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}>{a}</TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames:15})}/>
  <TransitionSeries.Sequence durationInFrames={90}>{b}</TransitionSeries.Sequence>
</TransitionSeries>
```
- A `Transition` shortens total duration because the scenes overlap. Account for this in calculateMetadata.
- `TransitionSeries.Overlay` (≥4.0.415) puts an effect on the cut, such as `@remotion/light-leaks`, without changing timing.
- Do not use `layout="none"`; it throws in v5.

## 5. Audio (`@remotion/media` `<Audio>`, the recommended component)
```tsx
import {Audio} from '@remotion/media';
import {whoosh, ding} from '@remotion/sfx';   // exports are just URLs: https://remotion.media/whoosh.wav
// music bed, looped, fade-in + ducking under voice-over
<Audio src={staticFile(`projects/${slug}/music.mp3`)} loop loopVolumeCurveBehavior="extend"
  volume={(f) => interpolate(f, [0, 30], [0, 0.35], {extrapolateRight:'clamp'}) * (isVoiceAt(f) ? 0.4 : 1)} />
// sfx at a frame
<Audio src={whoosh} from={120} durationInFrames={30} />
// trim start of source
<Audio src={staticFile('x.mp3')} trimBefore={60} durationInFrames={60} />
```
- Props:
  - `from` and `durationInFrames` are available since 4.0.446.
  - `trimBefore` is available.
  - `trimAfter` is **deprecated**; use `durationInFrames` instead.
  - Others: `volume` (a number or `(mediaFrame)=>number`), `loop`, `loopVolumeCurveBehavior: 'repeat'|'extend'`, `playbackRate` (it changes pitch), `muted`, `name`, `premountFor`, `onError → 'fallback'|'fail'`.
- Keyframe volume vs callback volume:
  - Volume written as `interpolate(useCurrentFrame(), ...)` can be edited as keyframes in Studio.
  - A callback volume is drawn in Studio but cannot be edited.
- `startFrom` is legacy naming. Use `trimBefore`.
- `@remotion/sfx`:
  - MIT package, 30+ sounds normalized to −3 dB peak.
  - Examples: whoosh, whip, pageTurn, uiSwitch, mouseClick, ding, shutter; the rest are mostly memes.
  - The files are hosted on the `remotion.media` CDN, so they need network access at render time.
  - Recommendation: download them into `public/` for offline, reproducible renders.
- Other free sources listed in the docs: freesound.org (CC0 filter), kenney.nl (CC0), soundcn.xyz.

## 6. Syntax-highlighted code (best current approach)
Use the official **Code Hike** template approach: `codehike@1.0.4` + `@code-hike/lighter@1.0.3` + `@remotion/layout-utils`.
- All highlighting happens **inside `calculateMetadata`** and is async. It calls:
  - `getThemeColors(props.theme)`;
  - `processSnippet` → `HighlightedCode[]` (codehike `highlight()`);
  - `measureText({text:'A', fontFamily, fontSize, validateFontIsLoaded:true})` to size the width. The width must be even for MP4.
- The highlighted tokens are passed down as props, so the render stays deterministic and needs no `delayRender`.
- The template also animates code transitions between steps (`CodeTransition.tsx`, token morphing).
- The template's reference files are in `packages/template-code-hike/src/calculate-metadata/`.
- Scaffold with `npx create-video --yes --code-hike`. This flag is inferred from `cliId`; confirm the exact flag with `--help`.
- Plain Shiki in `calculateMetadata` would also work but has no official template. Prefer Code Hike.

## 7. CLI
```bash
npx remotion studio src/index.ts --port=3123 [--props=file.json] [--public-dir=...] [--disable-interactivity]
#   press "s" in terminal to reopen browser (≥4.0.487); --editor=cursor, --coding-agent=codex (≥4.0.506)
npx remotion render src/index.ts <compId> out/<slug>.mp4 --props=projects/<slug>/scenario.json \
   [--codec=h264 --crf=18 --concurrency=50% --overwrite --duration --fps --width --height]
npx remotion still src/index.ts <compId> out/thumb.png --frame=45 --props=...
npx remotion render <compId> out/frames --frames=0,30,90 --image-format=png   # multi-stills (≥4.0.502)
npx remotion compositions src/index.ts    # list ids
```
- Always pass `--props` as a **file path**. Inline JSON breaks in Windows shells, and the docs say so explicitly.
- Chrome Headless Shell is downloaded automatically on the first render. Offline or CI machines need `npx remotion browser ensure`.

## 8. Official agent skills
- Install: `npx skills add remotion-dev/skills`, from the agentskills.io format.
- The source lives in the monorepo at `packages/skills` and is mirrored to `remotion-dev/skills`.
- It contains one umbrella skill, `remotion-best-practices`, with these sub-skills:
  - remotion-create, remotion-markup (compositions, animation, fonts, audio, timing), remotion-studio, remotion-render;
  - remotion-captions, remotion-maps, remotion-saas, remotion-interactivity, remotion-docs (fetches doc pages as Markdown), remotion-upgrade, remotion-multimedia.
- Each skill includes `agents/openai.yaml` for Codex. The monorepo also has `claude-code-plugin` and `kimi-code-plugin` packages, which are not published to npm.

Recommendation: **reference it, do not vendor it**. Our `SKILL.md` should:
1. Tell the agent to run `npx skills add remotion-dev/skills` once (optional). If it is missing, fall back to `remotion-docs`-style fetches of `https://www.remotion.dev/docs/*.md`.
2. Contain only Nolan-specific rules: the scenario schema, the sync flow and the CLI commands.

Vendoring would go stale; the skills change almost every release, and `remotion-upgrade` updates them.

## 9. License caveat
- The Remotion License is **source-available, not OSS**.
- It is free for individuals, for-profit organizations with **3 or fewer employees**, non-profits, and evaluation.
- Larger for-profit companies need a Company License (remotion.pro).
- It is **forbidden** to copy or modify Remotion code to sell or sublicense a derivative of Remotion.
- For Christopher Nolan:
  - Our repo can be MIT because it only *depends* on Remotion and never bundles it.
  - The README must state that each end user's organization must comply with the Remotion license.
  - Do not vendor Remotion source.
- The license will change "slightly" in Remotion 5.0 (PR #3750). Recheck it when v5 ships.
- `@remotion/sfx` is MIT. Each sound has its own license, shown on its detail page; attribution is not required.

## Uncertain / to verify
- Whether the `writeStaticFile` mirror (§2) causes a Studio hot-reload loop. Test it before relying on it; `getCompositions` sync is the safe fallback.
- The exact `create-video` template flag names beyond `--blank`.
- Whether the Props panel handles `z.array(z.discriminatedUnion(...))` well. Only 2-type unions with null/undefined are listed as having controls. Plan a flat scene schema, e.g. `type: z.enum([...])` plus optional fields, or rely on JSON mode.
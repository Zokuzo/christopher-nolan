# Corrections and additions to the Christopher Nolan research briefs (checked live 2026-09-30)

## Top 5, verified

1. **Remotion's bundled ffmpeg cannot run the audio brief's commands as written.** `npx remotion ffmpeg` and `npx remotion ffprobe` exist in `@remotion/cli@4.0.530` (docs: "7.1 release line", cut down to Remotion's codecs). I tested the binary from `@remotion/compositor-linux-x64-gnu@4.0.530`:
   - **Audio filters available (only these 16):** `acopy adelay aformat amerge amix anull apad aresample asetpts asetrate atempo atrim loudnorm pan silencedetect volume`
   - **Missing:** `afade` and `ebur128`. Running `-af afade=...` fails with `No such filter: 'afade'`.
   - **Encoders present:** `libmp3lame`, `aac`, `libopus`, `pcm_s16le`, `pcm_s24le`. **Decoders present:** mp3, vorbis, flac, opus, aac.
   - **Working with the bundled binary** (`input_i` printed, mp3 written):
     ```bash
     npx remotion ffmpeg -y -ss 5 -t 30 -i in.mp3 -vn \
       -af "volume='min(1,t/1)':eval=frame,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" \
       -ar 48000 -c:a libmp3lame -b:a 192k bed.mp3
     ```
   - **Change these:**
     - Drop `afade` from the ffmpeg step.
     - Do fades and ducking in Remotion with `volume`/`interpolate`, which the design brief already does.
     - Use `loudnorm print_format=json` for the loudness check instead of `ebur128`.
     - Use system ffmpeg only if it is on PATH.

2. **A sensitive `userConfig` value in the Claude Code plugin never reaches the Node CLI.** From the manifest reference:
   - `${user_config.KEY}` is substituted only in MCP and LSP config, exec-form hook `args`, and skill or agent content. In skill content, **a sensitive value becomes a placeholder**.
   - `CLAUDE_PLUGIN_OPTION_<KEY>` is exported **only to hook processes**. The CLI runs through the agent's Bash tool, so it never sees it.
   - `title` and `description` are **required**, and extra keys make the plugin fail to load. Allowed keys: `type` (string|number|boolean|directory|file), `title`, `description`, `required`, `default`, `options`, `multiple`, `sensitive`, `min`, `max`.
   - **Fix:** the CLI reads `OPENROUTER_API_KEY` from the environment, then from `~/.config/christopher-nolan/.env` (created by a `nolan config set-key` command). Drop `userConfig.openrouter_api_key` from plugin.json, or keep it only with a hook that copies it into that file.

3. **`@remotion/light-leaks` is deprecated, and the replacement is not a drop-in.** npm still publishes 4.0.530 with no deprecation flag, but the docs say it "will no longer be published starting with Remotion 5.0".
   - The replacement is `lightLeak()` from `@remotion/effects/light-leak` (available from 4.0.500).
   - Options: `{seed?, hueShift?, progress?=0.5, disabled?}`.
   - It is a WebGL2 **effect passed in `effects={[...]}` on canvas-based components only** (`<CanvasImage>`, `<Video>`, `<Solid>`). Your own progress value drives it, e.g. `interpolate(frame,[0,30],[0,1])`. Docs: "The `<LightLeak>` component will not be moved."
   - **Fix:** drop the Remotion brief's suggestion of a `TransitionSeries.Overlay` plus light-leaks. For a cut flash, use `<Solid>` plus `lightLeak()` inside the Overlay, or skip the effect in v1.

4. **The codehike version conflict is resolved: pin `codehike@1.0.4` with `@code-hike/lighter@1.0.3`.** This is exactly what `packages/template-code-hike/package.json` on main pins.
   - `codehike@1.1.0` (2026-03-17) depends on `@code-hike/lighter@1.0.1`. Mixing 1.1.0 with 1.0.3 installs two copies of lighter.
   - The design brief's `shiki@4.4.3` is only needed on the plain-Shiki path. Don't add it next to Code Hike.
   - All six shiki theme ids from the design brief exist in `@shikijs/themes@4.4.3`: `vitesse-dark`, `vesper`, `github-dark`, `github-light`, `min-light`, `dracula`. They are only confirmed to exist in `@shikijs/themes`; they are not confirmed to work with Code Hike's lighter themes. Check that separately with `getThemeColors` on lighter 1.0.3.

5. **The Remotion brief's auto-save claim contradicts the current docs.** It says "since v4.0.437 every prop change is written to disk immediately". The current `visual-editing.mdx` on main still says: "save props back to the code via the 💾 button … default props must be inlined into your `<Composition>`".
   - **Treat it as unverified.** Build the `nolan sync` step so it works whether or not the user clicked 💾: tell them to click 💾, or render using the Studio "Render" dialog props.
   - The inline-literal requirement is confirmed.
   - The `writeStaticFile` restrictions are confirmed: path relative to `public/`, no writes outside it. The docs don't say whether a write triggers a hot reload, so the reload-loop risk is still untested.

## Other corrections and contradictions (not re-verified beyond what is noted)

- **`@remotion/sfx@4.0.530` exports (verified):** 32 URLs.
  - Usable default set: `whip whoosh pageTurn uiSwitch mouseClick shutterModern shutterOld ding recordScratch`. `vineBoom` is borderline.
  - The rest are memes (`bruh`, `wilhelmScream`, `windowsXpError`, …). Exclude them with an explicit allowlist.
  - There is no riser or impact sound, so Openverse or the bundled CC0 pack must supply them, as the design brief already says.
- **OpenRouter model ids (verified live today):** `google/gemini-3.8-flash-lite-tts`, `hexgrad/kokoro-82m`, `deepgram/flux-tts:free`, `recraft/recraft-v4.1-flash`, `black-forest-labs/flux.2-klein-4b`, `deepseek/deepseek-v4.1-flash`, `openai/gpt-5.6-luna`, `google/lyria-3-clip-preview`, `google/lyria-3-pro-preview`. Pricing units are still unverified; that needs an authenticated call.
- **Audio `download()` in the audio brief:** it rejects `application/octet-stream` responses, and Incompetech serves that type. Check the file extension or magic bytes instead. Wikimedia `ogg` decodes fine with the bundled ffmpeg (vorbis decoder present), so it can be converted to mp3 locally.
- **Versions:** `npx skills` is `skills@1.7.0` (confirmed). `@remotion/zod-types@4.0.530` depends only on `remotion@4.0.530` and does not pin zod, so pin `zod@4.5.4` in our own `package.json`.
- **`@remotion/effects`, `@remotion/paths`, `@remotion/noise`:** all at 4.0.530. Add them to the pinned set if the scene library uses them. The Remotion brief's `package.json` leaves them out.
- **Grilling mode (from the packaging brief):** the brief recommends batch rounds, but the user profile requires one question at a time. Set `grill.mode` to `sequential` by default, keeping the ❓/➡️ format.
- **Licensing:** `by-sa` is opt-in in the audio brief, but the design brief's credits scene assumes any CC license. Both must read from the same `assets.lock.json`/`credits.json` file. Pick one name: `assets.lock.json`.


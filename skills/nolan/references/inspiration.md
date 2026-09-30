# Inspiration: find references, distill them into tokens

Goal: 5-8 real references that match the grill decisions, turned into **one preset + at most 3 overrides + music moods**. No API key: use whatever web search/fetch tool the host agent has. Budget: a few minutes, not an hour.

## 0. Skip gracefully

No web search tool, the user wants to skip, or searches return nothing useful: say so in one line ("No web search here, so I'm picking the look from your answers: interstellar, amber accent."), write inspiration.json with `"references": []` and the chosen tokens, and move on. Never block the flow on this step.

## 1. Search

Fill `{topic}` (what the video is about: "CLI tool", "Rust database", "AI agent") and `{style}` (from the grill: "cinematic dark", "neon terminal", "editorial minimal"). Run 3-5 of these, not all:

- `"{topic}" product launch video motion design 2026`
- `site:vimeo.com {topic} product launch video`
- `"launch video" {similar product}` (e.g. Linear, Vercel Ship, Raycast, Arc, Supabase launch week)
- `site:youtube.com {language or framework} in 100 seconds` (fast, dense code format)
- `site:dribbble.com {style} motion ui dark`
- `site:behance.net {topic} explainer video styleframes`
- `site:awwwards.com {style} website typography` (palette and type only)
- `site:motionographer.com {style}`

Dribbble, Behance and some video pages block fetches or render client-side. Use the search snippets, page titles and `og:image`/meta descriptions instead; a failed fetch is normal, not an error. Never download or reuse anyone's footage, images or music: references inform the style only.

## 2. Distill

For each reference keep `{url, title, why}` where `why` is one line naming the trait you took ("amber on black, slow push-ins", "hard cuts on the beat").

Then extract these named traits across the set:

| Trait | Values |
|---|---|
| palette | hex values when visible, else named colors |
| type | grotesk, serif, mono, display |
| motion energy | calm, medium, punchy |
| cut rate | seconds per shot (e.g. 2-3 s) |
| texture | grain, glow, flat, scanlines |

## 3. Map to tokens

1. Pick the **closest preset** (`references/scenario.md`, "Picking a preset").
2. Override **at most 3** tokens, in this order of usefulness: `accent`, `displayFont` (a Google Fonts family), `energy` (calm / medium / punchy). `background`/`text` only to match a brand.
3. Check contrast: text vs background must be ≥ 4.5:1 (WCAG relative luminance). If an override fails, keep the preset's text color.
4. Music: 3-5 mood keywords, a BPM range, instruments and things to avoid. Start from the preset's moods and refine with what the references sound like.

## 4. Write `projects/<slug>/inspiration.json`

```json
{
  "references": [
    { "url": "https://vimeo.com/...", "title": "Acme launch film", "why": "amber on black, slow push-ins, one word per beat" }
  ],
  "traits": { "palette": ["#07080A", "#D9A441"], "type": "serif display + grotesk body", "energy": "calm", "cutRate": "2-3 s", "texture": "grain" },
  "preset": "interstellar",
  "overrides": { "accent": "#E0A84A", "energy": "calm" },
  "music": { "moods": ["cinematic", "ambient", "pulsing synth"], "bpm": [90, 110], "instruments": ["synth pads", "low strings"], "avoid": ["vocals", "EDM drops"] }
}
```

`overrides` keys use the scenario's `theme` field names so you can copy them straight into scenario.json. `music.moods` becomes `audio.music.mood`, `music.bpm` becomes `audio.music.bpm`.

## 5. Show the user (3 lines, then one question)

```
Look: interstellar (near-black, amber accent), Cinzel titles, slow cinematic motion, light grain.
Rhythm: 2-3 s per shot, fades, one hard cut on the reveal.
Sound: cinematic ambient with a pulsing synth, 90-110 bpm, no vocals.

❓ **Q15** - **Look**: Keep this direction?
➡️ Yes: it matches the "trailer" tone you chose.
```

On a change request, adjust the tokens (not the references) and show the 3 lines again. Then `nolan stage <slug> scenario`.

# Studio: preview, edits, sync, visual QA

Remotion Studio is the user's live preview and editor. `scenario.json` is the source of truth; `src/Root.tsx` is a generated copy that Studio edits; `nolan sync` brings Studio edits back.

```
scenario.json ──nolan studio──▶ src/Root.tsx (inline defaultProps) ──Studio 💾──▶ src/Root.tsx
      ▲                                                                            │
      └──────────────────────────── nolan sync ◀──────────────────────────────────┘
```

## 1. Look first: stills QA (you, before the user)

```bash
nolan stills <slug>                   # one frame per scene (final text) → projects/<slug>/stills/*.png
nolan stills <slug> --every 3         # one frame every 3 s
nolan stills <slug> --frames 45,300   # exact frames
```

Open **every** PNG with your image-reading tool and check:

- [ ] no text clipped, overflowing its box or touching the frame edge (16:9 safe margin ~96 px sides, 72 px top/bottom; 9:16 keeps the top 220 px and bottom 350 px clear)
- [ ] text readable: contrast, size (body ≥ 32 px at 1080p), no word hidden behind grain or vignette
- [ ] the right fonts (not a fallback serif/sans), the right preset colors
- [ ] code: correct language highlighting, highlighted lines visible, ≤ 18 lines fit
- [ ] diagrams: nodes don't overlap, edges connect the right nodes, labels fit
- [ ] images load (no blank or broken frame)
- [ ] outro shows CTA, URL and credits

A still is the middle of the scene, or later for code, terminal and stats scenes so typing and count-ups have finished. Other motion may still be running: if something looks half-animated, check a later frame with `--frames`. Fix issues in scenario.json (shorter text, fewer lines, another layout), `nolan validate <slug>`, re-run stills for those scenes. Only then open Studio.

## 2. Start Studio

```bash
nolan studio <slug>            # regenerates src/Root.tsx, starts Studio, prints the URL
nolan studio <slug> --port 3200
nolan studio <slug> --stop
```

Default URL: `http://localhost:3123` (config `studioPort`). Studio keeps running in the background (pid in `projects/<slug>/.studio.pid`). Only one project is loaded at a time. Remotion Studio listens on every network interface (Remotion 4.0.530 has no host option) and its API can write project files: use it on a trusted network and run `nolan studio <slug> --stop` when done.

Tell the user, in 3 lines:

1. Open the URL, pick the `<slug>` composition, press space to play.
2. The **Props** panel (right side) holds everything: texts, scene lengths, theme, colors, music volume. Edit a field; the preview updates instantly.
3. Click **💾 (save)** after editing, then tell me: I'll pull your edits in.

## 3. What the user can edit in Studio

Everything in scenario.json, through the Props panel generated from the schema:

- scene texts, code, bullets, stats, commands, `seconds`, per-scene `transition`
- theme preset, color overrides (color pickers), fonts, grain, energy
- default transition type and length
- music / sfx / voice volumes, `duckTo`, on/off switches
- adding, removing or reordering scenes (array controls), or the JSON editing mode for bigger changes

**Limit (say it if the user asks to drag things on the timeline):** scenes are generated from data, so timeline drags, canvas moves and keyframe edits in Studio are **not** saved. Change `seconds` or the text in the Props panel instead, or ask you in chat. Custom hand-animated ("ejected") scenes are not supported in v1.

## 4. Sync Studio edits back

```bash
nolan sync <slug>
```

Reads the inline props from `src/Root.tsx`, drops derived `_*` fields, validates, and if anything changed: snapshots the previous scenario (`versions/vNNN.json`), writes the new one and prints a diff summary. Tell the user the diff in one line ("Synced: hook text changed, code scene 6 s → 8 s").

Run `sync`:

- when the user says they edited something,
- **before every chat-driven edit** of scenario.json (otherwise regenerating Root.tsx overwrites their Studio edits),
- at the start of a resumed session at preview stage.

`nolan render` also syncs automatically.

If the user edited but forgot 💾, sync finds no change: ask them to click 💾, then sync again.

**Conflict** (both Studio and scenario.json changed since the last `studio`): sync exits 1 and prints both edit lists. Ask the user which side wins, then `nolan sync <slug> --force` (keep Studio's) or `nolan studio <slug> --force` (keep scenario.json, regenerate Root).

## 5. Chat-driven edits

1. `nolan sync <slug>`
2. edit `projects/<slug>/scenario.json`
3. `nolan validate <slug>`
4. `nolan studio <slug>` (regenerates Root.tsx; the open Studio tab hot-reloads)
5. `nolan stills <slug> --frames ...` for the scenes you touched, and look at them

Batch several requested changes into one pass when possible.

## 6. Versions

```bash
nolan snapshot <slug> --note "before new hook"
nolan versions <slug>
nolan restore <slug> v004        # snapshots the current version first, so it is undoable
```

After `restore`, run `nolan studio <slug>` so Studio shows the restored version.

## 7. Render

```bash
nolan render <slug> --draft      # half resolution, fast, for a quick full watch
nolan render <slug>              # full quality → projects/<slug>/renders/<slug>-vNNN.mp4 + thumbnail
nolan render <slug> --out ~/Desktop/launch.mp4
```

`render` syncs, validates and snapshots first. Give the user the path, size, duration and the printed credits. `nolan approve <slug>` requires a full (non-draft) render of the current version.

## Troubleshooting

| Problem | Fix |
|---|---|
| URL does not answer | `nolan studio <slug> --stop`, then `nolan studio <slug>`; port busy: `--port 3200` |
| Studio shows another project or old data | `nolan studio <slug>` (regenerates Root.tsx) |
| Props panel shows a validation error | the user typed an invalid value (e.g. `seconds` 0): fix it there, or sync fails with the same message |
| fonts look wrong | family name misspelled in `displayFont`/`bodyFont`/`monoFont`: use the exact Google Fonts name |
| no sound in preview | click the speaker icon in Studio; check `audio.music.src` is set (`nolan audio all <slug>`) |

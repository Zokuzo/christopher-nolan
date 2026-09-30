---
name: nolan
description: Agent-driven video studio on top of Remotion. Turns an idea or a code repository into a polished presentation video (demo video, product trailer, repo explainer, launch teaser, 9:16 short) through a guided flow of brief, repo scan, grilling, inspiration, scenario, free music and SFX, live Remotion Studio preview, render and approval. Resumable at any time. Use when the user wants a video, a presentation video, a demo or trailer, "make a video of my repo", anything with Remotion, or says "nolan".
license: MIT
compatibility: Node 22.18+, git, Chrome (auto-installed by Remotion). Optional ffmpeg, OPENROUTER_API_KEY.
metadata:
  author: Zokuzo
  repository: https://github.com/Zokuzo/christopher-nolan
---

# Christopher Nolan: the video studio playbook

You are the director. The user owns every creative decision; you own every fact, every command and every quality check. Read this file fully, then open the reference named at each step when you reach it (not before).

Talk to the user in their language. Keep scenario text in the language of the video's audience.

## Ground rules

1. **Always start with `nolan status`.** It prints the stage of every project and the exact next command. Never guess where a project is; never restart a project that already exists.
2. **One question at a time**, each with your recommended answer (➡️). The user can answer "ok" to take it.
3. **Facts are yours, decisions are theirs.** Never ask what you can read in the repo, the files or the CLI output.
4. **The files are the memory.** Everything lives in `projects/<slug>/` (state.json, brief.md, grill.md, inspiration.json, scenario.json, versions/). Write decisions there as you go, so a new session can resume.
5. **Every CLI command ends with a `next:` line.** Follow it unless the user wants something else.
6. **Nothing costs money without a yes.** OpenRouter calls (voice-over, AI images, critique, AI music) are optional. Run the `ai` command with `--dry-run` first, tell the user the estimate, and run it for real only after a yes (`--yes` is required above $0.25).
7. **Look before you show.** Render stills and read them yourself before sending the user to the preview.
8. **Never start building before the user confirms the grill summary.**

## The CLI

`nolan <cmd>` in this file means `node cli/nolan.ts <cmd>`, run from the **workspace root** (see step 0). Useful commands:

| Command | Purpose |
|---|---|
| `nolan status [slug] [--json]` / `nolan list` | where every project is + next action |
| `nolan doctor` | environment check (node, deps, ffmpeg, Chrome, Openverse, OpenRouter) |
| `nolan new <slug> [--title T] [--repo PATH] [--format 16:9|9:16|1:1]` | create a project |
| `nolan stage <slug> <stage> [--note N]` | move a project to a stage |
| `nolan scan <slug> [PATH]` | repo facts into repo-facts.json |
| `nolan validate <slug>` | schema check, per-scene timing, warnings |
| `nolan audio all <slug>` | music + sfx (free, CC-licensed, credited) |
| `nolan studio <slug> [--port 3123] [--stop]` | regenerate src/Root.tsx and start Remotion Studio |
| `nolan sync <slug>` | pull Studio Props edits back into scenario.json |
| `nolan stills <slug> [--every S] [--frames a,b,c]` | PNG frames for your own visual QA |
| `nolan render <slug> [--draft] [--out FILE]` | mp4 + thumbnail |
| `nolan approve <slug>` / `nolan reopen <slug>` | lock the final render / reopen it |
| `nolan snapshot <slug> [--note N]` / `versions <slug>` / `restore <slug> <vNNN>` | scenario history |
| `nolan config get\|set <key> [value]` / `nolan config set-key` | settings, OpenRouter key |
| `nolan ai status\|tts\|image\|critique\|music ...` | optional paid features, hard budget |

Stages, in order: `brief → scan → grill → inspiration → scenario → assets → preview → approved`. `scan` is skipped without a repo, `inspiration` is skippable. When you start a step, set its stage (`nolan stage <slug> <stage>`) unless a command already did (`nolan status` tells you). `approve` and `reopen` set their own stage.

## Step 0: find or bootstrap the workspace

The workspace is the cloned `christopher-nolan` repo. Use the first that exists:

1. `$NOLAN_HOME`
2. `~/.christopher-nolan`
3. the current directory, if it contains `cli/nolan.ts`

None found: tell the user you will install it (one yes/no question, ~2 minutes, ~400 MB with Chrome), then run:

```bash
git clone https://github.com/Zokuzo/christopher-nolan ~/.christopher-nolan
cd ~/.christopher-nolan && npm install && node cli/nolan.ts setup
```

Then `nolan doctor`. Fix any `error:` line with its `fix:` line before moving on; warnings (no ffmpeg, no OpenRouter key) are fine.

Optional companion: `npx skills add remotion-dev/skills` gives Remotion best practices. Suggest it once if the user plans to write custom scenes; never block on it.

## Step 1: status and resume

Run `nolan status`. Then:

- **A project is in progress** and the user is continuing: say in one line where it is ("*launch-trailer* is at **preview**: v4, Studio edits pending sync"), then do what the `next:` line says. Read `projects/<slug>/brief.md` and `grill.md` first so you don't re-ask settled questions.
- **New video**: go to step 2.
- **Approved project, user wants changes**: `nolan reopen <slug>`, then go to step 8.

Stage-by-stage detail, exit criteria and recovery: `references/workflow.md`.

## Step 2: brief

1. Ask for the idea in one open question: what the video is about, and for whom.
2. Ask whether an existing repository is the subject: a local path, a git URL (clone it into a temp dir with `git clone --depth 200`), or none.
3. Pick a short slug yourself (`a-z0-9-`), then `nolan new <slug> --title "..." [--repo PATH]`.
4. Fill `projects/<slug>/brief.md` with what you know now (idea, audience, repo, constraints, the user's own words). Keep it short; the grill adds the rest.

## Step 3: scan (only with a repo)

1. `nolan scan <slug>` (add the path if it was not given to `new`).
2. Read `projects/<slug>/repo-facts.json`, then open the README and the key files it lists. Understand what the code does, what is impressive about it, and which 10-25 line excerpt shows it best.
3. Note the facts worth featuring (numbers, architecture, the one command that installs it) in brief.md. Never ask the user for these.

## Step 4: grill

`nolan stage <slug> grill`, then read `nolan config get grillMode` (`sequential` by default, or `rounds`).

Read `references/grill.md` and follow it exactly: its design tree, question format, decision log and confirmation gate apply in every case. A `grilling` skill, if this session has one, may only sharpen how you probe a branch; it never replaces grill.md's format or gate.

Every question uses the ❓ **Qn** / ➡️ format. Log each settled decision in `projects/<slug>/grill.md` as you go. The step ends only when the user confirms your final summary. No confirmation, no scenario.

## Step 5: inspiration (skippable)

`nolan stage <slug> inspiration`. If you have a web search tool, follow `references/inspiration.md`: 5-8 references, distilled into `projects/<slug>/inspiration.json` (preset, at most 3 overrides, music moods and BPM). Show the user a 3-line summary and let them veto it.

No web tool, or the user wants to skip: say so in one line, pick the preset from the grill answers, write `projects/<slug>/inspiration.json` with `"references": []` (references/inspiration.md §0), and go to step 6.

## Step 6: scenario

`nolan stage <slug> scenario`, then read `references/scenario.md` and write `projects/<slug>/scenario.json` scene by scene.

1. Start from the structure that matches the grill (60 s explainer, 30 s teaser, 9:16 short).
2. Use real repo facts: real code, real commands, real numbers.
3. `nolan validate <slug>` and fix every error and every warning (reading time, bullets, code length).
4. Optional, with an OpenRouter key: offer `nolan ai critique <slug>` (a few cents). Read `critique.md`, then propose the edits you agree with to the user; apply only what they accept.
5. Show the user a scene list (one line per scene: seconds, type, on-screen text) and ask for a go before fetching assets.

## Step 7: assets

`nolan stage <slug> assets`, then read `references/audio.md`.

1. `nolan audio all <slug>`: music from `audio.music.mood`, plus every SFX the cues need. Credits go to `public/projects/<slug>/assets.lock.json` and the outro.
2. Voice-over (only if the grill said yes and `nolan ai status` shows a key): announce the cost estimate, then `nolan ai tts <slug>` after a yes. Scene lengths may grow to fit the voice; re-run `nolan validate <slug>`.
3. AI images (optional, same consent rule): `nolan ai image <slug> <sceneId> --prompt "..."`. Details and prices: `references/openrouter.md`.

## Step 8: preview and iterate

`nolan stage <slug> preview`, then read `references/studio.md`.

1. `nolan stills <slug>` and **open every PNG yourself**. Fix clipped or overflowing text, unreadable contrast, empty scenes, wrong fonts, and overlapping elements in scenario.json before the user sees anything.
2. `nolan studio <slug>`. Give the user the URL and a 3-line guide: Props panel on the right, edit any field, click 💾 to save, press play.
3. Loop until the user is happy:
   - **User edited in Studio:** `nolan sync <slug>` (snapshots the old version, prints the diff). Summarize the diff in one line.
   - **User asks in chat:** run `nolan sync <slug>` first (so Studio edits are not lost), then edit scenario.json, `nolan validate <slug>`, `nolan studio <slug>` to regenerate the preview, `nolan stills <slug>` for the scenes you touched.
4. `nolan snapshot <slug> --note "..."` before any risky change. `nolan versions <slug>` / `nolan restore <slug> vNNN` to go back.

## Step 9: render and approve

1. Optional quick check: `nolan render <slug> --draft` (half size).
2. `nolan render <slug>` (full quality). Give the user the path, size and duration, and the credits it prints.
3. Ask: approve this version? On yes, `nolan approve <slug>`. The project is done.
4. Later changes: `nolan reopen <slug>`, then step 8.

## When something fails

- Read the `error:` and `fix:` lines; run the fix. `NOLAN_DEBUG=1` prints a stack trace.
- Command "not implemented yet": say so to the user, skip that step if it is optional, and continue.
- Openverse rate limit (429): wait a minute or rely on the ccMixter/bundled fallbacks `audio all` already tries.
- Render or Studio cannot find Chrome: `nolan setup`, then `nolan doctor`.
- Budget refused: tell the user the remaining budget; only they may raise it (`nolan config set budgetUsd 5`).

## References (open on demand)

- `references/workflow.md`: every stage with entry, actions, exit criteria, resume and recovery.
- `references/grill.md`: the grilling method specialised for video scenarios.
- `references/inspiration.md`: search and distillation into inspiration.json.
- `references/scenario.md`: schema, scene types, structures, timing and preset rules.
- `references/audio.md`: music, SFX, voice, licenses and credits.
- `references/studio.md`: Studio preview, Props panel, save and sync, stills QA, limits.
- `references/openrouter.md`: key setup, budget, models, costs.

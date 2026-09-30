# Workflow: every stage in detail

`nolan <cmd>` = `node cli/nolan.ts <cmd>` from the workspace root. Stage = the step currently **in progress**. `nolan status <slug>` always prints the stage, the to-do and the next command.

```
brief → scan → grill → inspiration → scenario → assets → preview → approved
         (no repo: skip)   (no web tool: skip)
```

## Project files

| File | Written by | Purpose |
|---|---|---|
| `projects/<slug>/state.json` | CLI | stage, history, version, approval |
| `projects/<slug>/brief.md` | you | idea, audience, repo, user's words, key facts |
| `projects/<slug>/repo-facts.json` | `scan` | languages, tree, deps, git stats, code excerpt candidates |
| `projects/<slug>/grill.md` | you | decision log, one line per settled decision |
| `projects/<slug>/inspiration.json` | you | references, preset, overrides, music moods |
| `projects/<slug>/scenario.json` | you, `sync`, `ai tts`, `audio` | the video itself |
| `projects/<slug>/critique.md` | `ai critique` | second-model review |
| `projects/<slug>/versions/vNNN.json` | `snapshot`, `sync`, `render` | scenario history |
| `projects/<slug>/stills/*.png` | `stills` | frames for your visual QA |
| `projects/<slug>/renders/*.mp4` | `render` | outputs |
| `public/projects/<slug>/` | `audio`, `ai` | music, sfx, voice, images, `assets.lock.json` (credits) |

## brief

- **Enter:** `nolan new <slug> --title "..." [--repo PATH] [--format 16:9|9:16|1:1]`. It creates state.json, a brief.md template and a valid 3-scene starter scenario.
- **Do:** ask the idea (who is it for, what should they do after watching), then the repo question. Fill brief.md. Remote repo: `git clone --depth 200 <url> "$(mktemp -d)/repo"` and pass that path to `scan`.
- **Exit when:** brief.md states idea, audience and repo (or "no repo").
- **Next:** `nolan scan <slug> [PATH]`, or without a repo `nolan stage <slug> grill`.

## scan

- **Do:** `nolan scan <slug> [PATH]`. Read repo-facts.json, the README and 3-6 key files. Pick: the one-sentence pitch, 2-3 real numbers, the install command, the best 10-25 line excerpt, the architecture in 3-6 boxes.
- **Write:** a "Facts" section in brief.md. These are never asked to the user.
- **Exit when:** you could explain the project to a newcomer in 30 seconds.
- **Next:** `nolan stage <slug> grill`.

## grill

- **Do:** `references/grill.md`. Mode from `nolan config get grillMode`.
- **Write:** each decision in grill.md as it is settled; the confirmed summary at the end.
- **Exit when:** the user explicitly confirms the summary ("yes", "go", "ok"). Silence or a new question is not a confirmation.
- **Next:** `nolan stage <slug> inspiration` (or `nolan stage <slug> scenario` to skip).

## inspiration

- **Do:** `references/inspiration.md` with the host's web search. 5-8 references max; do not browse for more than a few minutes.
- **Exit when:** inspiration.json exists and the user has seen the 3-line summary (or skipped).
- **Next:** `nolan stage <slug> scenario`.

## scenario

- **Do:** `references/scenario.md`. Write scenario.json, `nolan validate <slug>`, fix everything, optional `nolan ai critique <slug>`.
- **Exit when:** validate prints no error and no warning you have not deliberately accepted, and the user said go on the scene list.
- **Next:** `nolan stage <slug> assets`, `nolan audio all <slug>`.

## assets

- **Do:** `references/audio.md`. `nolan audio all <slug>`; optional `ai tts`, `ai image` after consent.
- **Exit when:** `audio.music.src` is set (or music is deliberately disabled) and `nolan validate <slug>` reports no missing asset.
- **Next:** `nolan stage <slug> preview`, `nolan stills <slug>`, `nolan studio <slug>`.

## preview

- **Do:** `references/studio.md`. Stills QA first, then Studio. Iterate with the user.
- **Exit when:** the user says the preview is good.
- **Next:** `nolan render <slug>`, then `nolan approve <slug>` after the user approves the render.

## approved

- `state.approved` holds `{version, file, at}`. `nolan approve` refuses without a full-quality (non-draft) render of the current version: render first.
- **Change later:** `nolan reopen <slug>` (back to scenario), edit, re-render, re-approve.

## Resuming a session

1. `nolan status` (all projects) or `nolan status <slug>`.
2. Read brief.md and grill.md before speaking; never re-ask a settled decision.
3. Tell the user where the project is in one line, then follow `next:`.
4. At **preview** or later, always `nolan sync <slug>` before editing scenario.json: the user may have edited in Studio since your last session.

Studio still running from a previous session? `nolan studio <slug> --stop`, then `nolan studio <slug>`.

## Moving backwards

`nolan stage <slug> <stage>` accepts any stage. Typical cases:

- The user wants a different story: `nolan stage <slug> grill`, reopen only the affected branches (grill.md shows what was settled).
- New repo facts: `nolan scan <slug> PATH` again.
- Bad edit: `nolan versions <slug>`, `nolan restore <slug> vNNN` (it snapshots the current version first).

## Recovery table

| Symptom | Cause | Fix |
|---|---|---|
| `no project "<slug>"` | typo or other workspace | `nolan list`; check `$NOLAN_HOME` |
| `scenario.json is invalid` | schema error | edit the listed fields, `nolan validate <slug>` |
| validate warns "text too long" | reading time | shorten the text or raise `seconds` |
| Studio shows the old scenario | Root.tsx not regenerated | `nolan studio <slug>` |
| Chat edit lost Studio changes | edited before sync | `nolan versions <slug>`, restore the version `sync` saved |
| `audio` 429 / network error | Openverse rate limit | wait 60 s, retry; fallbacks are automatic |
| render fails on fonts/Chrome | missing headless Chrome | `nolan setup`, `nolan doctor` |
| `approve` refuses | no full render of this version | `nolan render <slug>` |
| budget refused | spent + estimate > budgetUsd | ask the user; `nolan config set budgetUsd <n>` only on their word |

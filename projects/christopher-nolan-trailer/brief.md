# Brief: Christopher Nolan — Trailer

## Idea
A ~45 s trailer for this very repo, made with the tool itself (dogfooding). It should feel like a film trailer, not a slideshow: dark, slow, confident.

## Audience
Developers who already use a coding agent (Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Copilot) and have a repo that deserves a demo video but no time for a timeline editor.

## Goal
Viewer installs the skill (`npx skills add Zokuzo/christopher-nolan`) or stars the repo.

## Repo
This workspace (`.`).

## Facts (from the scan, never asked)
- One skill (`skills/nolan/SKILL.md`) + one Node CLI (`node cli/nolan.ts`), no build step, Node 22.18+.
- 12 scene types, 6 theme presets, 20 CLI commands, 8 transitions.
- One zod schema (`src/schema.ts`) shared by Remotion Studio's Props panel and the CLI validator.
- Base usage needs no API key: free CC-licensed music and SFX, credits generated automatically.
- Optional OpenRouter extras (voice-over, images, critique) behind a hard USD budget.

## Constraints
- 16:9, ~45 s, interstellar preset.
- No voice-over (the demo must work without a key).
- Real code excerpt and real commands only.

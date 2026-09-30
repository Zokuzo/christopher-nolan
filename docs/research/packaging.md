# Brief: making Christopher Nolan work in any coding agent (checked against live sources, 2026-09-30)

## 1. Agent Skills open standard (agentskills.io/specification, last modified 2026-08-04)

**Folder layout**
```
skills/christopher-nolan/
├── SKILL.md        # required
├── scripts/        # executables (our Node CLI entry points)
├── references/     # loaded on demand, one level deep from SKILL.md
└── assets/         # templates, schemas, LUTs, etc.
```

**Frontmatter fields**

| Field | Required | Rule |
|---|---|---|
| `name` | yes | 1-64 chars, `[a-z0-9-]`, no leading/trailing or double hyphen, **must equal the parent dir name** |
| `description` | yes | 1-1024 chars; say what it does AND when to use it, with trigger keywords |
| `license` | no | SPDX or bundled file ref |
| `compatibility` | no | ≤500 chars, e.g. `Requires Node 20+, ffmpeg, Chrome (Remotion)` |
| `metadata` | no | string→string map |
| `allowed-tools` | no | experimental, space-separated, e.g. `Bash(npx:*) Read` |

**Progressive disclosure:** only name and description are loaded at startup (~100 tokens). The SKILL.md body is recommended at under 5k tokens and under 500 lines. Put everything else in `references/`.

**Validation:** `skills-ref validate ./skills/christopher-nolan` (github.com/agentskills/agentskills/tree/main/skills-ref).

**Claude Code extensions** (code.claude.com/docs/en/skills). Other agents ignore these fields:
- `argument-hint`, `arguments`
- `disable-model-invocation: true` makes it user-triggered only via `/name`
- `user-invocable: false`
- `model`, `effort`
- `context: fork` plus `agent`, to run in a subagent
- `disallowed-tools`

**Where each agent looks (verified from each vendor's docs)**

| Agent | Project | User/global |
|---|---|---|
| Claude Code | `.claude/skills/` (+ plugins) | `~/.claude/skills/` |
| OpenAI Codex | `.agents/skills/` in every dir from CWD up to the repo root | `~/.agents/skills/`, `/etc/codex/skills` (vercel table also lists `~/.codex/skills`) |
| Gemini CLI | `.gemini/skills/` or `.agents/skills/` (the `.agents` alias wins) | `~/.gemini/skills/`, `~/.agents/skills/` |
| Cursor | `.cursor/skills/`, `.agents/skills/`; also reads `.claude/skills/`, `.codex/skills/` | `~/.cursor/skills/`, `~/.agents/skills/`, `~/.claude/skills/`, `~/.codex/skills/` |
| OpenCode | `.opencode/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.config/opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| GitHub Copilot | `.github/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.copilot/skills/`, `~/.agents/skills/` |

**Takeaway:**
- `.agents/skills/<name>/SKILL.md` is the cross-agent path.
- `.claude/skills/` is the second-most-read path.
- Don't commit duplicates. Keep the canonical copy in `skills/` and let the installer place it.

## 2. `npx skills add` (vercel-labs/skills, npm `skills@1.7.0`, MIT)

- **Install:** `npx skills add Zokuzo/christopher-nolan`. Also accepts a full URL, a `/tree/main/skills/<name>` URL, any git URL, or a local path.
- **Flags:**
  - `-g` global
  - `-a claude-code -a codex ...` target agents (`'*'` = all)
  - `-s <skill>` (`'*'` = all)
  - `-l` list only
  - `--copy` instead of symlink
  - `-y` / `--all` non-interactive
- **Scope:**
  - Project installs go to `./<agent-dir>/skills/`.
  - `-g` installs go to `~/<agent-dir>/skills/`.
  - The default method symlinks each agent's dir to one canonical copy.
  - It auto-detects which agents are installed.
- **Discovery in a repo:**
  - Root `SKILL.md`, if present.
  - Otherwise `skills/`, `skills/.curated|.experimental|.system/`, and every known agent dir (`.agents/skills/`, `.claude/skills/`, ...), walked up to 3 levels deep (`skills/<cat>/<name>/SKILL.md` works).
  - A shallower SKILL.md hides deeper ones.
  - `--full-depth` also finds files outside those dirs.
- **Extra frontmatter:** `metadata.internal: true` hides a skill unless `INSTALL_INTERNAL_SKILLS=1`.
- **Prompt-only use without installing:** `npx skills use Zokuzo/christopher-nolan@christopher-nolan | claude` (or `--agent codex`).
- **Other commands:** `list`, `find`, `update`, `remove`, `init`.

**Recommended repo layout:** skills under `skills/`, no root SKILL.md. A root SKILL.md would hide the sub-skills.

## 3. AGENTS.md

- Plain Markdown at the repo root, no schema. Nested files are allowed.
- The **closest file to the edited file wins**, and the user's chat prompt overrides everything.
- Read natively by Codex, Jules, Cursor, Gemini CLI (via config), GitHub Copilot, Aider (`read: AGENTS.md`), and others.
- **Claude Code** (memory docs) reads `AGENTS.md` only when there is **no** `CLAUDE.md`/`CLAUDE.local.md` in the CWD or above. If a CLAUDE.md exists, only the CLAUDE.md files load.
- **Pattern** (the same one mattpocock's repo uses): make `AGENTS.md` the real file and symlink `CLAUDE.md -> AGENTS.md`.

**Scope:** AGENTS.md is for contributors working *on* the tool (build, test, render commands). It is not the end-user workflow. End users get the skill.

## 4. Claude Code plugin + marketplace

`/plugin marketplace add Zokuzo/christopher-nolan` (or `claude plugin marketplace add Zokuzo/christopher-nolan`) needs `.claude-plugin/marketplace.json` at the repo root. The repo can be both the marketplace and the plugin (`source: "./"`), the same way mattpocock-skills does it.

**`.claude-plugin/marketplace.json`**
- Required: `name`, `owner.name`, `plugins[]`.
- Each entry requires `name` and `source`.
```json
{
  "name": "christopher-nolan",
  "owner": { "name": "Zokuzo", "url": "https://github.com/Zokuzo" },
  "description": "Agent-driven Remotion video studio",
  "plugins": [{
    "name": "christopher-nolan",
    "source": "./",
    "description": "Scenario grill -> Remotion Studio preview -> render, with auto music/SFX",
    "category": "media",
    "tags": ["video", "remotion"]
  }]
}
```

**`.claude-plugin/plugin.json`**
- Only `name` is required.
- `skills` adds to the default `skills/` scan.
- `commands`, `agents` and `outputStyles` replace their default scans.
```json
{
  "name": "christopher-nolan",
  "version": "0.1.0",
  "description": "Agent-driven Remotion video studio",
  "author": { "name": "Zokuzo" },
  "repository": "https://github.com/Zokuzo/christopher-nolan",
  "license": "MIT",
  "skills": ["./skills/"],
  "userConfig": {
    "openrouter_api_key": { "type": "string", "title": "OpenRouter API key (optional)",
      "description": "Enables TTS, AI images, second-model critique", "sensitive": true }
  }
}
```

**Plugin rules**
- The **entry `name` must equal the plugin.json `name`**. Otherwise installs by manifest name fail with `Plugin "<x>" not found in marketplace`.
- Relative `source` paths start at the repo root and must not contain `..`.
- `version` pins users to that version until you bump it.
- Use `${CLAUDE_PLUGIN_ROOT}` in hooks and MCP args to reach bundled scripts.
- Plugin skills are namespaced, e.g. `/christopher-nolan:nolan`.

**Install and validate**
- Install with `/plugin install christopher-nolan@christopher-nolan`.
- Validate with `claude plugin validate .`; add `--strict` to fail CI on warnings.

**Uncertain:**
- The exact `userConfig` option keys beyond `type/title/description/sensitive` weren't checked. It is a strict schema, so an unknown key stops the plugin from loading.
- How a `userConfig` value reaches our CLI (env var vs `${user_config.KEY}`) wasn't checked. See the manifest-reference "Environment variables" section.

**`dependencies`:**
- A plugin can declare `"dependencies": ["mattpocock-skills@mattpocock"]`.
- Cross-marketplace dependencies are blocked unless the root marketplace.json lists `"allowCrossMarketplaceDependenciesOn": ["mattpocock"]`.
- **Recommendation: don't declare the dependency.** Grilling must work without it (see section 6).

## 5. Slash-command equivalents

One SKILL.md gives a manual trigger nearly everywhere. Name the entry skill `nolan` (or `christopher-nolan`):

| Agent | Manual invocation |
|---|---|
| Claude Code | `/nolan` (standalone) or `/christopher-nolan:nolan` (plugin); `disable-model-invocation: true` makes it manual-only |
| Cursor | `/nolan`; also honours `disable-model-invocation: true`, and `/migrate-to-skills` converts old commands into skills |
| Codex | `$nolan` mention, list with `/skills` |
| Gemini CLI | auto-activates; `/skills list` shows skills. For a real `/nolan`, add `.gemini/commands/nolan.toml` (**unverified**: this TOML format wasn't fetched) |
| OpenCode / Copilot | auto-activation by description; explicit command files are agent-specific (**unverified**) |

**Recommendation:**
- One entry skill, `nolan`, handles the whole flow: idea → repo → grill → Studio preview → validate → render → resume.
- Run steps through the CLI, e.g. `node scripts/cn.mjs <step>`, so any agent that can run Bash can drive it.
- Keep `disable-model-invocation` **off**, so agents without slash commands can still trigger it from the description.
- Don't ship per-agent command files in v1.

## 6. mattpocock `grilling` skill: its method (read in full, v1.2.3)

1. **Design tree.** The subject is modelled as decisions, each branching into the decisions that depend on it.
2. **Rounds over the frontier.**
   - The frontier is every decision whose prerequisites are settled.
   - Each round asks the **whole frontier at once**. It is *not* one question at a time. That was the old behaviour, and its `batch-grill-me` variant was merged into `grilling`.
   - A question that depends on another open question in the same round moves to a later round.
   - Typically about 13 questions land in about 3 rounds.
3. **Fixed format per question.** Every question is numbered and carries a recommended answer, so the user can reply by number ("1 yes, 2 option B, 3 no, because...").
   ```
   ❓ **Q1** - **<title>**: <body, may include multiple choices>

   ➡️ <recommended answer>

   ---
   ```
4. **Recompute after every answer.** Each answer reshapes the tree. The next round is recomputed, not scripted in advance, and it asks what the answers unblocked.
5. **Facts vs decisions.**
   - Facts are the agent's job: it dispatches a sub-agent or looks things up (filesystem, tools) and never asks the user for something it can find.
   - It doesn't block on that lookup. Only questions downstream of a running exploration wait; the rest of the frontier gets asked now.
   - Decisions belong to the user. An agent that answers its own decisions has broken the skill.
6. **End condition.** The session ends when the frontier is empty, with every branch visited and nothing silently assumed. It must **not act until the user confirms** shared understanding. That confirmation gate is mandatory.
7. **Documented details:**
   - No question cap, by design; the user steers with "wrap up".
   - One-at-a-time mode is an officially supported opt-out: the user adds `When grilling, ask one question at a time.` to their CLAUDE.md or AGENTS.md.
   - Known failure: weaker models collapse the session into 2 questions plus an outline, or start building. The fix is a "don't implement without permission" line.
   - Known failure: **a skill that names another skill doesn't reliably make it load.** The tell is questions with no `➡️` recommendations.

**License:** MIT, Copyright (c) 2026 Matt Pocock, per `LICENSE` at the plugin root. Copying and modifying are allowed if the copyright and permission notice are kept.

## 7. How to ship the grill step

Because skill-to-skill loading is unreliable (see above), **embed the method and treat mattpocock's skill as an optional upgrade**, not the reverse.

1. **Embed** `skills/nolan/references/grill.md`, an adapted copy of the method.
   - Header: `Adapted from mattpocock/skills "grilling" (MIT, © 2026 Matt Pocock)`.
   - Add `THIRD_PARTY_NOTICES.md` with the full MIT text.
   - Adapt it to scenarios by seeding the design tree with video-specific roots:
     - audience / goal
     - duration / aspect ratio
     - narrative arc / hook
     - repo facts to feature (auto-discovered, never asked)
     - visual theme
     - music mood / BPM
     - SFX density
     - voice-over (only if an OpenRouter key exists)
     - CTA / outro
2. **In SKILL.md step 3:** "If a skill named `grilling` is available in this session, invoke it on the scenario design tree below. Otherwise read `references/grill.md` and follow it exactly. In both cases, output rounds in the ❓/➡️ format and stop until the user confirms the scenario."
3. **Hand off through a file, not chat memory.**
   - The agent writes the settled decisions to `projects/<slug>/scenario.json`.
   - The CLI validates that file (zod) before generating the Remotion composition.
   - This file makes "resume at any time" possible: re-running `/nolan` reads the scenario and lets the user reopen single branches.
4. **Respect the one-at-a-time opt-out.** If the host's AGENTS.md/CLAUDE.md contains the one-at-a-time line, ask sequentially. This reader has an ADHD profile, so consider making sequential the default via `cn config grill.mode=sequential|rounds`.
5. **Don't** declare `mattpocock-skills` as a plugin dependency or require `npx skills add mattpocock/skills`. Mention it in the README as an optional companion.

## Suggested repo skeleton

```
AGENTS.md                      # contributor instructions; CLAUDE.md -> AGENTS.md
.claude-plugin/{plugin.json,marketplace.json}
skills/nolan/SKILL.md          # name: nolan; description with triggers "video", "presentation video", "Remotion"
skills/nolan/references/{grill.md,audio-sourcing.md,openrouter.md,remotion-studio.md}
skills/nolan/scripts/          # thin wrappers -> packages/cli
THIRD_PARTY_NOTICES.md
```

**Install paths to document:**
- `npx skills add Zokuzo/christopher-nolan` (any agent)
- `/plugin marketplace add Zokuzo/christopher-nolan` (Claude Code)
- `git clone` plus the `.agents/skills` symlink (manual)

## Still uncertain

- Whether the Gemini CLI `.gemini/commands/*.toml` format is still current (not fetched).
- Where a Claude Code plugin's `userConfig` value is exposed at runtime.
- Exact precedence when the same skill name exists in both `.agents/skills` and `.claude/skills` in agents that read both (Cursor, OpenCode, Copilot).

Sources: agentskills.io/specification.md, github.com/vercel-labs/skills (README), registry.npmjs.org/skills, agents.md, code.claude.com/docs/en/{plugin-marketplaces,plugins/manifest-reference,plugins/marketplace-reference,plugins/dependencies,memory,skills}.md, developers.openai.com/codex/skills, geminicli.com/docs/cli/skills, cursor.com/docs/context/skills, opencode.ai/docs/skills, docs.github.com/en/copilot/concepts/agents/about-agent-skills, and the local mattpocock-skills 1.2.3 plugin cache (`skills/productivity/grilling/SKILL.md`, `docs/productivity/grilling.md`, `LICENSE`, `.claude-plugin/*.json`).
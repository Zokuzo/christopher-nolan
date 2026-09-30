<!--
Adapted from mattpocock/skills "grilling" (MIT, © 2026 Matt Pocock).
https://github.com/mattpocock/skills. Full license text in THIRD_PARTY_NOTICES.md.
Changes: specialised to video scenarios, seeded design tree, one question at a time by default,
decision log file, explicit confirmation gate.
-->

# Grill: interview the user until the video is fully designed

Interview the user relentlessly until you both share one understanding of the video. Map it as a **design tree**: every decision branches into the decisions that hang off it. You ask, the user decides, and you do not build anything until they confirm.

## The design tree (seed it with these roots)

| # | Root decision | Typical branches | Depends on |
|---|---|---|---|
| 1 | **Audience and goal** | who watches, what they should do after (star, install, buy, understand) | none |
| 2 | **Where it plays** | YouTube, X, LinkedIn, landing page, conference screen, TikTok/Reels | 1 |
| 3 | **Format and duration** | 16:9 / 9:16 / 1:1; 30 s teaser, 45-60 s explainer, 2 min deep dive | 2 |
| 4 | **Hook** | the first 3 s (1.5 s in 9:16): a bold claim, a pain point, a surprising number | 1 |
| 5 | **Narrative arc** | hook → problem → reveal → how it works → proof → CTA; which beats to cut for short formats | 3, 4 |
| 6 | **What to feature** | which code excerpt, which command, which diagram, which numbers | 5 + repo facts |
| 7 | **Visual theme** | one of the 6 presets, accent or font override | 1, 2 (+ inspiration) |
| 8 | **Music** | mood words, energy (calm/medium/punchy), or no music | 7 |
| 9 | **SFX density** | none, subtle (cuts + titles), rich (+ typing, counters) | 8 |
| 10 | **Voice-over** | only if `nolan ai status` shows a key: yes/no, language, voice character | 3; key present |
| 11 | **CTA and outro** | URL, call to action text, credits (always on when CC-BY assets are used) | 1 |

Add branches the answers open (a second language version, a logo to include, brand colors to match). Drop branches that don't apply (no voice root without a key; tell the user voice-over is available with an OpenRouter key and move on).

**Facts are not decisions.** Repo name, languages, number of commits, what the code does, the install command, star count: find these yourself (`repo-facts.json`, README, the code, `nolan config get`, `nolan ai status`). Never ask the user for something you can look up. If a lookup is still running, ask the frontier questions that don't depend on it.

**Decisions are the user's.** Never answer one yourself, even when your recommendation is obvious. Put it to them with the recommendation and wait. A decision the user already stated (in the request, the brief, or earlier in the chat, e.g. "30 s vertical 9:16") is settled: log it as `(user)` with where they said it, and do not ask it again.

## The frontier

The **frontier** is every decision whose prerequisites are settled: the questions you can ask now without guessing at an answer you haven't heard. After each answer, recompute it. A question that depends on another open question is not on the frontier yet.

## Asking

Read the mode: `nolan config get grillMode`.

- **`sequential` (default):** ask **one** frontier question per message, the one that unblocks the most. Wait for the answer. Recompute. Repeat.
- **`rounds`:** ask the whole frontier in one message, numbered, and wait for all answers.

Every question uses this exact format:

```
❓ **Q3** - **Hook**: The first 3 seconds decide whether people keep watching. Options:
A) the pain: "Your repo deserves better than a README"
B) a number: "12 scene types. 0 timeline editing."
C) a question: "What if your agent could direct?"

➡️ A: it names the viewer's problem before the product, which suits a developer audience on X.
```

- Number questions continuously across the session (Q1, Q2, ...), so the user can answer "Q3: B".
- Offer 2-4 concrete options when choices exist. Always include your recommendation after ➡️ with a one-line reason tied to earlier answers or repo facts.
- "ok", "yes", "your call" or an empty answer means the user takes your recommendation. Say what was settled in a few words, then ask the next question.
- For the theme question, describe each candidate preset in one line (colors, type, motion) so the user can picture it.
- Keep each question short. Put long context (a proposed script, a scene list) in the question body, never in a separate message before it.

The user steers the length: "wrap up" means settle the remaining frontier with your recommendations, list them, and go to the confirmation gate. There is no question cap otherwise, but a typical video grill is 8-14 questions.

## The decision log

Append each decision to `projects/<slug>/grill.md` as soon as it is settled, so a new session can resume mid-grill:

```markdown
# Grill: <title>

## Decisions
- Q1 Audience: backend devs who already use Claude Code; goal: install the plugin. (user)
- Q2 Where: X and the README header. (recommended, accepted)
- Q3 Format: 16:9, 45 s. (user)

## Open
- Voice-over (waiting: user checks their OpenRouter account)

## Confirmed summary
(filled at the gate)
```

Resuming: read grill.md, skip everything under Decisions, continue with Open and the recomputed frontier.

## The confirmation gate (mandatory)

When the frontier is empty (every branch visited, nothing silently assumed), write a summary in 6-10 lines: audience and goal, format and duration, hook, the scene outline (one line per beat), theme, music and SFX, voice-over, CTA. Then ask:

```
❓ **Q14** - **Confirm**: Is this the video we're making? Anything to change?

➡️ Yes: go to inspiration and scenario.
```

Only an explicit yes closes the grill. Copy the confirmed summary into grill.md under "Confirmed summary", then `nolan stage <slug> inspiration` (or `scenario` to skip).

## Failure modes to avoid

- Asking 2 questions and then writing a scenario: the grill is incomplete until the gate.
- Questions without ➡️: a recommendation is mandatory.
- Asking facts ("what language is your repo in?"): look it up.
- Starting to build (writing scenario.json, fetching audio) before the confirmation.
- Re-asking settled decisions after a resume: read grill.md first.

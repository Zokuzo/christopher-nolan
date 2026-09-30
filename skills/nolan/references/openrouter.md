# OpenRouter: optional paid features under a hard budget

Everything in Christopher Nolan works without a key. An `OPENROUTER_API_KEY` unlocks four extras:

| Feature | Command | Default model | Typical cost |
|---|---|---|---|
| Voice-over (TTS) | `nolan ai tts <slug> [--voice V] [--model M]` | `google/gemini-3.8-flash-lite-tts` | cents for a 60 s script |
| AI image (background or image scene) | `nolan ai image <slug> <sceneId> --prompt "..." [--model M]` | `recraft/recraft-v4.1-flash` | ~$0.007 per image |
| Second-model critique of the scenario | `nolan ai critique <slug> [--model M]` | `openai/gpt-5.6-luna` | ~$0.01 |
| AI music (experimental) | `nolan ai music <slug>` | `google/lyria-3-clip-preview` | ~$0.04 per 30 s clip |

Prices are from the OpenRouter listing on 2026-09-30 and change; the CLI reserves an estimate from live pricing where it can.

## Consent pattern (every paid command)

1. Run it with `--dry-run` first: it prints the estimate and the remaining budget, calls nothing, spends nothing.
2. Tell the user the estimate in one line and ask for a yes.
3. On yes, run it again without `--dry-run`. Above $0.25 the CLI refuses unless you add `--yes`; add it only after the user's explicit yes.

Other flags: `ai tts` takes `--scene ID` (one scene only) and `--force` (regenerate existing voice files); `ai music` takes `--prompt "..."`. `ai status` is free.

## Key setup (the user does it, never paste keys into chat logs)

1. The user creates a key at https://openrouter.ai/keys. Recommend a **dedicated key with a credit limit** (e.g. $5): it is the server-side safety net on top of the local budget.
2. They run, in their own terminal:
   ```bash
   node cli/nolan.ts config set-key
   ```
   It reads the key from stdin and stores it in `~/.config/christopher-nolan/.env` (mode 600). An `OPENROUTER_API_KEY` environment variable also works and takes precedence.
3. Check: `nolan ai status` (key present, budget cap, spent, remaining, OpenRouter's own remaining limit).

If the user pastes a key into the chat anyway, don't echo it back; pipe it into `nolan config set-key` via stdin and suggest they rotate it later.

## Budget

- Hard cap in USD, default **$2.00**: `nolan config get budgetUsd`.
- Before each call the CLI reserves an estimate and **refuses** if `spent + estimate > budgetUsd`. After the call it settles the real cost (`usage.cost`, or `/generation` for TTS). Failures are voided. Ledger: `~/.config/christopher-nolan/ledger.jsonl`.
- A `402` from OpenRouter (credits exhausted) stops everything immediately.
- Only the user raises the budget: `nolan config set budgetUsd 5`. Never do it on your own.

## When to offer each feature

- **Critique** (scenario stage): offer once, after `validate` is clean. Read `critique.md`, then present the edits you agree with, one question at a time; apply only accepted ones. You stay the director: the critique is advice.
- **TTS** (assets stage): only if the grill settled "voice-over: yes". Narration must exist on the scenes first. Pick a voice matching the language (French: a voice listed with fr support; the CLI prints candidates). After it, `nolan validate <slug>` (scenes may have grown).
- **Images**: only for scenes where a real screenshot or the repo has nothing to show (abstract backgrounds, a hero image). Prompt with the preset's palette and "no text" (generated text is unreliable). Prefer real screenshots of the product when available.
- **Music**: experimental; propose only if free sources gave nothing usable. Mention the output is watermarked (SynthID) and subject to Google's terms.

## Models

Defaults are in config (`ttsModel`, `imageModel`, `critiqueModel`, `musicModel`) and can be changed:

```bash
nolan config set critiqueModel deepseek/deepseek-v4.1-flash   # cheapest critic
nolan config set ttsModel hexgrad/kokoro-82m                    # cheap, 8 languages incl. French
```

Model IDs change often. On "model not found" the CLI prints current candidates; pick one and set it. Other good options (2026-09-30): critique `qwen/qwen3.8-flash`, `google/gemini-3.8-flash`, `x-ai/grok-4.7` (premium); images `black-forest-labs/flux.2-klein-4b`, `qwen/qwen-image-3`; TTS `microsoft/mai-voice-2-flash` (French voice), `deepgram/flux-tts:free` (English, free).

## Troubleshooting

| Message | Meaning | Fix |
|---|---|---|
| no key | no env var, no `.env` | user runs `nolan config set-key` |
| budget refused | the estimate would exceed `budgetUsd` | tell the user remaining budget; they decide |
| 401 | invalid key | user creates a new key, `config set-key` again |
| 402 | OpenRouter credits exhausted | user tops up on openrouter.ai; stop all `ai` calls |
| model not found | model ID retired | pick from the printed candidates, `nolan config set <x>Model <id>` |
| `ai music` shape error | experimental API changed | fall back to `nolan audio music <slug>` |

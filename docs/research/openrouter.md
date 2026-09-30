# OpenRouter API brief for Christopher Nolan (verified 2026-09-30)

Sources: `openrouter.ai/docs/llms.txt`, the `.md` doc pages, the OpenAPI schemas, and live unauthenticated calls to `GET /api/v1/models`, `/api/v1/images/models` and `/api/v1/models?output_modalities=speech`. No API key was available, so no authenticated calls were made. Every response shape below comes from the docs or the OpenAPI examples, not from a real run.

Base URL: `https://openrouter.ai/api/v1`. Auth header: `Authorization: Bearer $OPENROUTER_API_KEY`. The optional attribution headers `HTTP-Referer` and `X-Title` were not re-verified.

---

## 1. Image generation

OpenRouter has two paths. Use the new dedicated Image API (A) as the primary one.

### A. `POST /api/v1/images` (dedicated Image API)

- **Request fields:**
  - `model`, `prompt`
  - `resolution`: `512|1K|2K|4K`
  - `aspect_ratio`: `16:9`, `9:16`, `1:1`, `auto`, …
  - `size`: `"2K"` or `"1920x1080"`. An explicit pixel size wins, and a conflicting `aspect_ratio` returns 400.
  - `quality`: `auto|low|medium|high`
  - `output_format`: `png|jpeg|webp|svg`
  - `background`: `transparent|opaque|auto`
  - `n` (up to 10), `seed`
  - `input_references`: `[{type:"image_url",image_url:{url}}]` for image-to-image
  - `provider`: `{only, order, ignore, sort, allow_fallbacks, options:{[slug]:{...}}}`
  - `stream` (SSE, only on some models)
- **Response:** `{ created, data:[{ b64_json, media_type }], usage:{ prompt_tokens, completion_tokens, total_tokens, cost } }`. Cost comes back inline in USD.
- **Discovery:**
  - `GET /api/v1/images/models` lists 55 models, each with typed `supported_parameters`: `{type:"enum"|"range"|"boolean"}`.
  - `GET /api/v1/images/models/{id}/endpoints` returns `pricing:[{billable, unit: image|megapixel|token, cost_usd, variant?}]`.
  - Validate parameters against these at runtime. Every model accepts a different subset.

```ts
async function genImage(prompt: string, model = "recraft/recraft-v4.1-flash") {
  const r = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, aspect_ratio: "16:9" }),
  });
  if (!r.ok) throw new Error(`images ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { bytes: Buffer.from(j.data[0].b64_json, "base64"), mime: j.data[0].media_type, cost: j.usage?.cost ?? null };
}
```

**Cheap, good models (live endpoint pricing today):**

| Model | Price | Notes |
|---|---|---|
| `recraft/recraft-v4.1-flash` | $0.007/image | Cheapest. Supports `aspect_ratio` and `n` only. |
| `black-forest-labs/flux.2-klein-4b` | $0.014/megapixel | About $0.029 for a 1920x1080 frame. Supports `seed`. |
| `qwen/qwen-image-3` | $0.03/image (1k/2k) | Supports resolution, seed and references. |
| `bytedance-seed/seedream-5-0-lite` | $0.035/image | |
| `google/gemini-3.1-flash-lite-image` | $30 per 1M output-image tokens | ~$0.04/image. Estimate assumes ~1.3k tokens/image; **UNVERIFIED**. |
| `recraft/recraft-v4.1-vector` | $0.08 | SVG output. Good for diagram-style slides. |
| `openai/gpt-image-2` (premium) | ~$0.13 | High-quality 16:9. Docs example took 94 s. |

### B. Chat completions with an image modality (legacy path, still in the schema)

- **Request:** `POST /chat/completions` with `modalities:["image","text"]`.
- **Response:** `choices[0].message.images[]`, each item `{ image_url: { url: "data:image/png;base64,..." } }`. Verified in the OpenAPI `ChatAssistantImages` schema.
- **Models:** only chat image models such as `google/gemini-2.5-flash-image` and `openai/gpt-5-image-mini`.
- **Why keep it:** as a fallback only. It helps when the prompt needs a reasoning model in the loop.

A third option, `tools:[{type:"openrouter:image_generation"}]`, is a server tool that defaults to `openai/gpt-5-image`. Not needed here.

---

## 2. Voice-over (TTS)

**Dedicated endpoint (verified): `POST /api/v1/audio/speech`.** It is OpenAI-compatible.

- **Body:**
  - `model`, `input` (both required)
  - `voice`: depends on the provider and is required unless the provider documents a default
  - `response_format`: `mp3|pcm`, default `pcm`
  - `speed`: honored by some models; others ignore it or return 400
  - `input_references`: for voice cloning
  - `provider`
- **Response:** raw audio bytes, not JSON.
  - `audio/mpeg` for mp3.
  - `audio/pcm` for pcm, which is 16-bit little-endian. **The sample rate is not documented, so measure it.**
  - The generation ID arrives in the `X-Generation-Id` response header. Cost is not in the body; see section 4.
  - **Use `mp3` for Remotion** so no WAV header has to be built.
- **Discovery:** `GET /api/v1/models?output_modalities=speech` returns `supported_voices[]` for each model.

```ts
async function tts(text: string, model = "google/gemini-3.8-flash-lite-tts", voice = "Charon") {
  const r = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text, voice, response_format: "mp3" }),
  });
  if (!r.ok) throw new Error(`tts ${r.status}: ${await r.text()}`);
  return { bytes: Buffer.from(await r.arrayBuffer()), genId: r.headers.get("x-generation-id") };
}
```

**Live speech models (19).** The `pricing.prompt` field is **most likely USD per input character**, but this is **UNVERIFIED**. Confirm it with `/generation` after a test call.

- **Default:** `google/gemini-3.8-flash-lite-tts`, prompt $0.0000005 and completion $0.000006. Voices include Zephyr, Puck, Charon, Kore, Aoede and more.
- **Cheaper alternative:** `hexgrad/kokoro-82m`, $0.00000062 on DeepInfra and $0.000004 on Together. Covers 8 languages, including French (FR).
- **Free option:** `deepgram/flux-tts:free` (English only). `fish-audio/s2.1-pro-free:free` also exists, but OpenRouter marks it for testing and low volume.
- **Quality and French:**
  - `microsoft/mai-voice-2-flash` ($0.000015, voice `fr-FR-Soleil:MAI-Voice-2`)
  - `mistralai/voxtral-mini-tts-2603` ($0.000016, supports cloning)
  - `minimax/speech-2.8-turbo` / `speech-2.8-hd`
  - `deepgram/aura-2` (includes `aura-2-agathe-fr`)
- **Cloning:** `fish-audio/s2.1-pro` and `voxtral`. Send one `input_audio` part and an optional transcript `text` part. The reference audio is limited to 20 MiB of base64.
- **Flag:** the docs example uses `openai/gpt-4o-mini-tts-2025-12-15`, but **it is not in today's live speech listing**. Do not hardcode it; pick a model through discovery.

**Chat audio output (legacy path, not recommended for voice-over):**

- **Models:** `openai/gpt-audio` and `openai/gpt-audio-mini`.
- **Request:** `modalities:["text","audio"]`, `audio:{voice, format: wav|mp3|flac|opus|pcm16}`, and **`stream:true` is required**.
- **Response:** chunks arrive in `choices[0].delta.audio.{data (base64), transcript}`. Concatenate the base64 before decoding.
- **Why not:** the model rewrites the text, so it is not a faithful reading of the script.

---

## 3. Text models for script critique (live prices, USD per 1M tokens in/out)

- **Cheapest default:** `deepseek/deepseek-v4.1-flash` at 0.02/0.396, 1M context.
- **Strong, cheap second opinion:**
  - `openai/gpt-5.6-luna` at 0.2/1.2
  - `qwen/qwen3.8-flash` at 0.15/0.47
  - `z-ai/glm-5.3-flash` at 0.15/0.5
- **Mid tier:** `google/gemini-3.8-flash` at 0.75/3.75.
- **Premium critic:** `x-ai/grok-4.7` at 2/6. The host agent is often Claude, and a critic from a different model family gives a more independent review.
- **Free:** `qwen/qwen3.8-27b:free`. Free models have their own rate limits; the `limit_remaining`/`free_model_daily_requests` fields in section 4 track them.
- **Aliases:** `~`-prefixed IDs such as `~deepseek/deepseek-flash-latest` point to whatever is latest. Pin concrete IDs in config for reproducibility.
- **Price ceiling per request:** `provider.max_price:{prompt, completion, request, image, audio}` exists in the chat schema.

```ts
const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: H,
  body: JSON.stringify({ model: "openai/gpt-5.6-luna", messages, response_format: { type: "json_object" },
    provider: { max_price: { request: 0.05 } } }) });
const j = await r.json(); // j.id = generation id, j.usage.cost = USD
```

---

## 4. Cost tracking and the hard USD budget

**Verified facts:**

- **Inline cost is always returned.** `usage:{include:true}` is now **deprecated and ignored**: every chat response carries `usage.cost` (USD), plus `cost_details.upstream_inference_cost`, `prompt_tokens`, `completion_tokens` and `*_details`. When streaming, it arrives in the last SSE chunk. The Image API returns `usage.cost` in its body and in the `image_generation.completed` event.
- **`GET /api/v1/generation?id=gen-…`** returns `data.total_cost` (also `usage`), `model`, `provider_name`, `native_tokens_*`, `num_media_completion`, `cancelled`, `streamed`. This is the **only cost source for TTS**, via `X-Generation-Id`.
  - **Test at runtime:** whether `/generation` returns 404 for a few seconds after a request (it historically lagged), and whether it covers Image API IDs.
- **`GET /api/v1/key`** works with a normal key. It returns `data.{limit, limit_remaining, limit_reset ("monthly"|null), usage, usage_daily, usage_weekly, usage_monthly, is_free_tier, free_model_daily_requests:{limit,remaining,used}, expires_at}`.
- **`GET /api/v1/credits`** now **requires a management key** and returns `{total_credits, total_usage}`. The tool should not depend on it.
- **HTTP 402** means insufficient credits or the key's limit was reached. Treat it as a hard stop, not a retry.
- **Server-side guard:** tell users to create a **dedicated key with a credit limit** in the dashboard (the OpenRouter-enforced backstop). Workspace budgets also exist.

**Recommended local ledger (ponytail version: one JSONL file with no dependencies).**

- **File:** `.nolan/ledger.jsonl`, one line per call: `{ts, project, step, model, kind:"chat"|"image"|"tts"|"music", genId, estUsd, actualUsd|null, status}`.
- **Before each call, reserve:**
  1. `spent = sum(actualUsd ?? estUsd)`.
  2. If `spent + estimate > NOLAN_BUDGET_USD`, refuse and write nothing.
  3. Otherwise append a line with `status:"reserved"`.
  - Estimates come from live pricing: image = `cost_usd` × n; TTS = chars × `pricing.prompt`; chat = `max_tokens` × completion price plus prompt tokens; music = $0.04 or $0.08.
- **After each call:** append `status:"settled"` with `actualUsd` from `usage.cost`. For TTS, settle from `/generation` with a retry and backoff of 1, 2, 4 and 8 s. If it is still missing, keep the estimate so the ledger never under-counts.
- **On failure:** append `status:"void"`. Zero-completion responses are not billed, per OpenRouter's "zero completion insurance".
- **Cross-check at session start:** call `GET /key`. If `limit_remaining < remaining local budget`, use the smaller value.
- **Concurrency:** use `fs.appendFileSync` and run calls one at a time inside a process (a single queue). `// ponytail: single-process lock; add a lockfile if parallel renders are ever needed.`

```ts
const ledger = ".nolan/ledger.jsonl";
const spent = () => (fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean) : [])
  .map((l) => JSON.parse(l)).reduce((m, e) => (m.set(e.id, e), m), new Map<string, any>())
  .values().reduce?.call ? 0 : 0; // simplify: last line per id wins, sum actualUsd ?? estUsd where status !== "void"
```

That `spent()` sketch is not usable as written. Implement it with a plain loop that keys by `id`, keeps the last line for each `id`, and skips `void`. Add one assert-based self-check to catch mistakes.

---

## 5. Music generation: yes

- **Models:**
  - `google/lyria-3-clip-preview`: $0.04 per 30 s clip. Use it for loops and beds.
  - `google/lyria-3-pro-preview`: $0.08 per full song, with structure and optional vocals.
- **Output:** 48 kHz stereo. Input is text plus one optional image.
- **Access:** chat completions with `modalities:["text","audio"]`. Supported params: `max_tokens, temperature, top_p, seed, response_format`. The listing shows a per-token price of `"0"`, so billing is per item and the ledger must hardcode the estimate. Confirm with `usage.cost`.
- **UNVERIFIED, test first:**
  1. Whether `stream:true` is required (it is for gpt-audio).
  2. Where the audio lands: `delta.audio.data` or `message.audio.data`.
  3. The container format and whether `audio.format` is accepted.
  4. How to request an instrumental (put "instrumental, no vocals" in the prompt).

```ts
const r = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: H, body: JSON.stringify({
  model: "google/lyria-3-clip-preview", modalities: ["text", "audio"], stream: true,
  messages: [{ role: "user", content: "30s instrumental lo-fi synthwave bed, 90 BPM, no vocals" }] }) });
// parse SSE: collect choices[0].delta.audio?.data (base64) → Buffer; usage.cost in final chunk
```

- **Licensing:** Google's terms for Lyria output apply. Output is SynthID-watermarked. **Review before shipping as default.**
- **Other audio:** `bytedance-seed/seed-audio-1-0` (speech-list model, $0.0025 per completion unit) can "produce speech and other audio". It is a possible SFX source; **UNVERIFIED**.

---

## Runtime test checklist (run once with a real key, about $0.30 total)

1. `/images` with `recraft/recraft-v4.1-flash`: confirm `usage.cost` is present, and which `aspect_ratio` values it accepts.
2. `/audio/speech` with `gemini-3.8-flash-lite-tts`, mp3: fetch `/generation?id=` to confirm the per-character pricing unit and how long `/generation` takes to return data.
3. Lyria clip: confirm SSE vs non-streaming, the field path, and the file format.
4. `GET /key` with a limited key, then force a 402 by setting the limit to $0.01.
5. `pcm` sample rate, only if pcm is ever used.

Sources:
- [OpenRouter llms.txt index](https://openrouter.ai/docs/llms.txt)
- [Image Generation (Image API)](https://openrouter.ai/docs/guides/overview/multimodal/image-generation.md)
- [Text-to-Speech](https://openrouter.ai/docs/guides/overview/multimodal/tts.md) and [Create speech](https://openrouter.ai/docs/api/api-reference/tts/create-speech.md)
- [Audio](https://openrouter.ai/docs/guides/overview/multimodal/audio.md)
- [Usage Accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting.md)
- [Get generation](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation.md), [Get current key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key.md), [Get credits](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits.md)
- [Chat completion schema](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request.md)
- [Lyria 3 Clip](https://openrouter.ai/google/lyria-3-clip-preview/api), [Lyria 3 Pro](https://openrouter.ai/google/lyria-3-pro-preview/api)
- Live data: `https://openrouter.ai/api/v1/models`, `/api/v1/images/models`, `/api/v1/models?output_modalities=speech`


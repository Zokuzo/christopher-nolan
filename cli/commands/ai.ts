// `nolan ai status|tts|image|critique|music`: optional OpenRouter features behind the hard USD budget.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, str, type Flags } from '../lib/args.ts';
import { readConfig } from '../lib/config.ts';
import { fail, info, json, next, ok, warn } from '../lib/log.ts';
import { PUBLIC_DIR, projectDir, publicProjectDir } from '../lib/paths.ts';
import { loadScenario, saveScenario, updateScenario } from '../lib/scenario.ts';
import { probeDuration } from '../lib/ffmpeg.ts';
import { readLock, updateLock, type LockEntry } from '../lib/lock.ts';
import { SCENE_TYPES, THEME_PRESETS, type Scenario } from '../../src/schema.ts';
import {
	findModel, generationCost, getKey, imageEndpoints, imageEstimate, keyInfo, NO_KEY_HELP, price, request, requireKey,
	type KeyInfo,
} from '../ai/client.ts';
import { ledgerPath, readLedger, reserve, settle, spentUsd, usd, voidEntry, type Entry } from '../ai/ledger.ts';

const CONFIRM_ABOVE_USD = 0.25;
const BOOLEANS = ['dry-run', 'yes', 'force'];

// ------------------------------------------------------------------ budget gate

type Budget = { budget: number; spent: number; remaining: number; keyRemaining: number | null };

const budgetState = async (key?: string): Promise<Budget & { keyInfo?: KeyInfo; keyError?: string }> => {
	const budget = readConfig().budgetUsd;
	const spent = spentUsd(readLedger());
	let ki: KeyInfo | undefined;
	let keyError: string | undefined;
	if (key) {
		try { ki = await keyInfo(key); }
		catch (e) { keyError = (e as Error).message; }
	}
	const keyRemaining = ki?.limit_remaining ?? null;
	const remaining = Math.max(0, Math.min(budget - spent, keyRemaining ?? Infinity));
	return { budget, spent, remaining, keyRemaining, keyInfo: ki, keyError };
};

// Prints estimate + budget; returns false on --dry-run. Fails when over budget or unconfirmed above $0.25.
const gate = async (key: string, estimate: number, what: string, flags: Flags, retry: string): Promise<boolean> => {
	const b = await budgetState(key);
	if (b.keyError?.includes(' 401 ')) fail(`OpenRouter rejected the key (401)`, 'node cli/nolan.ts config set-key');
	if (b.keyError) warn(`could not cross-check the key limit (${b.keyError.split('\n')[0]}); using the local ledger only`);
	info(`estimate: ${usd(estimate)} for ${what}`);
	info(`budget: ${usd(b.budget)} · spent: ${usd(b.spent)} · remaining: ${usd(b.remaining)}${b.keyRemaining !== null ? ` (OpenRouter key limit remaining: ${usd(b.keyRemaining)})` : ''}`);
	if (estimate > b.remaining + 1e-9) {
		const byKey = b.keyRemaining !== null && b.keyRemaining < b.budget - b.spent;
		fail(`refused: estimate ${usd(estimate)} exceeds the remaining ${byKey ? 'OpenRouter key limit' : 'budget'} ${usd(b.remaining)}`,
			byKey ? 'raise the key limit at https://openrouter.ai/settings/keys' : `node cli/nolan.ts config set budgetUsd ${Math.ceil(b.spent + estimate + 1)}`);
	}
	if (flags['dry-run']) {
		info('dry run: nothing was called or spent');
		next(retry);
		return false;
	}
	if (estimate > CONFIRM_ABOVE_USD && !flags.yes) {
		fail(`estimate ${usd(estimate)} is above ${usd(CONFIRM_ABOVE_USD)}: confirm with the user first`, `${retry} --yes`);
	}
	return true;
};

// One paid HTTP call: reserve → call → settle; void on failure (then rethrow, 402 included).
const paid = async <T>(
	meta: Pick<Entry, 'project' | 'step' | 'model' | 'kind' | 'estUsd'>,
	call: () => Promise<{ result: T; actualUsd: number | null; genId?: string }>,
): Promise<T> => {
	const entry = reserve(meta, readConfig().budgetUsd);
	let r: Awaited<ReturnType<typeof call>>;
	try { r = await call(); }
	catch (e) { voidEntry(entry); throw e; }
	settle(entry, r.actualUsd, r.genId);
	if (r.actualUsd === null) warn(`actual cost unknown for ${meta.step}: the ledger keeps the estimate ${usd(meta.estUsd)}`);
	return r.result;
};

// ------------------------------------------------------------------ helpers

const upsertLock = (slug: string, entry: LockEntry): void => { updateLock(slug, [entry]); };

const generatedLock = (id: string, kind: LockEntry['kind'], file: string, title: string, model: string, extra: Partial<LockEntry> = {}): LockEntry => ({
	id, kind, file, title, creator: model, license: 'generated', licenseUrl: `https://openrouter.ai/${model}`,
	attribution: `${kind === 'voice' ? 'Voice-over' : kind === 'image' ? 'Image' : 'Music'} generated with ${model} via OpenRouter`,
	sourceUrl: `https://openrouter.ai/${model}`, provider: 'openrouter', ...extra,
});

const slugArg = (a: string[], usage: string): string => a[0] ?? fail('missing <slug>', usage);

// ponytail: stopword vote over 6 languages; add a scenario `language` field if this ever misfires.
const STOPWORDS: Record<string, string[]> = {
	en: ['the', 'and', 'is', 'to', 'of', 'you', 'with', 'your', 'this', 'it'],
	fr: ['le', 'la', 'les', 'et', 'est', 'des', 'une', 'vous', 'avec', 'pour', 'dans', 'votre'],
	es: ['el', 'los', 'las', 'y', 'es', 'una', 'con', 'para', 'por', 'que', 'tu', 'su'],
	de: ['der', 'die', 'das', 'und', 'ist', 'mit', 'ein', 'eine', 'nicht', 'sie', 'ihr', 'zu'],
	it: ['il', 'gli', 'della', 'e', 'con', 'una', 'per', 'che', 'sono', 'questo', 'tuo', 'di'],
	pt: ['o', 'os', 'as', 'uma', 'com', 'para', 'que', 'não', 'você', 'seu', 'do', 'da'],
};
export const detectLanguage = (text: string): string => {
	const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
	let best = 'en';
	let bestScore = 0;
	for (const [lang, list] of Object.entries(STOPWORDS)) {
		const set = new Set(list);
		const score = words.filter((w) => set.has(w)).length;
		if (score > bestScore) { best = lang; bestScore = score; }
	}
	return best;
};

// Voice tagged with the language (fr-FR-x, aura-2-x-fr, fr_x) → a known good default → first listed → provider default.
export const pickVoice = (voices: string[], lang: string): string | undefined => {
	const tagged = new RegExp(`(^|[-_])${lang}([-_]|$)`, 'i');
	return voices.find((v) => tagged.test(v)) ?? voices.find((v) => v === 'Charon') ?? voices[0];
};

const hash = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const extFor = (mime: string | null | undefined, fallback: string): string =>
	({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' } as Record<string, string>)[mime ?? ''] ?? fallback;

// ------------------------------------------------------------------ status

const status = async (flags: Flags): Promise<void> => {
	const key = getKey();
	const cfg = readConfig();
	const b = await budgetState(key);
	if (flags.json) {
		json({ keyPresent: !!key, budgetUsd: b.budget, spentUsd: b.spent, remainingUsd: b.remaining, keyLimitRemaining: b.keyRemaining,
			keyError: b.keyError ?? null, ledger: ledgerPath(), models: { tts: cfg.ttsModel, image: cfg.imageModel, critique: cfg.critiqueModel, music: cfg.musicModel } });
		return;
	}
	info(`key: ${key ? 'present' : 'missing'}`);
	info(`budget: ${usd(b.budget)} · spent: ${usd(b.spent)} · remaining: ${usd(b.remaining)}`);
	if (b.keyInfo) info(`OpenRouter key: limit ${b.keyInfo.limit === null ? 'none' : usd(b.keyInfo.limit)}, remaining ${b.keyRemaining === null ? 'unlimited' : usd(b.keyRemaining)}${b.keyInfo.limit === null ? ' (tip: set a credit limit on this key as a server-side backstop)' : ''}`);
	if (b.keyError) warn(`key check failed: ${b.keyError.split('\n')[0]}`);
	info(`models: tts ${cfg.ttsModel} · image ${cfg.imageModel} · critique ${cfg.critiqueModel} · music ${cfg.musicModel} (experimental)`);
	info(`ledger: ${ledgerPath()}`);
	if (!key) {
		info(NO_KEY_HELP);
		next('node cli/nolan.ts config set-key');
	} else next('node cli/nolan.ts ai tts <slug> --dry-run');
};

// ------------------------------------------------------------------ tts

const tts = async (pos: string[], flags: Flags): Promise<void> => {
	const slug = slugArg(pos, 'node cli/nolan.ts ai tts <slug> [--voice V] [--model M] [--scene ID] [--force] [--dry-run] [--yes]');
	let scenario = loadScenario(slug);
	const key = requireKey();
	const model = str(flags, 'model') ?? readConfig().ttsModel;
	const only = str(flags, 'scene');
	const lock = readLock(slug);
	const withText = scenario.scenes.filter((s) => s.narration?.trim() && (!only || s.id === only));
	if (only && !withText.length) fail(`scene "${only}" not found or has no narration`, `node cli/nolan.ts validate ${slug}`);
	if (!withText.length) fail('no scene has narration', `add "narration" to scenes in projects/${slug}/scenario.json`);

	const m = await findModel(model, '?output_modalities=speech');
	const voices = m?.supported_voices ?? [];
	const lang = detectLanguage(withText.map((s) => s.narration).join(' '));
	const voice = str(flags, 'voice') ?? pickVoice(voices, lang);
	if (str(flags, 'voice') && voices.length && !voices.includes(voice!)) fail(`voice "${voice}" is not offered by ${model}`, `--voice one of: ${voices.slice(0, 12).join(', ')}`);

	// Skip scenes whose voice file matches the same model+voice+text (unless --force).
	const todo = withText.map((s) => ({ scene: s, inputHash: hash(`${model}|${voice ?? ''}|${s.narration!.trim()}`) }))
		.filter(({ scene, inputHash }) => flags.force || !(scene.voiceSrc && existsSync(join(PUBLIC_DIR, scene.voiceSrc))
			&& lock.some((e) => e.id === `voice:${scene.id}` && e.inputHash === inputHash)));
	if (!todo.length) {
		ok('every narration already has an up-to-date voice-over (use --force to regenerate)');
		return next(`node cli/nolan.ts validate ${slug}`);
	}

	// pricing.prompt is most likely USD per input character (unverified); completion is per audio token
	// for Gemini-style models: assume 12 chars/s of speech and 32 audio tokens/s. Unknown → $0.00003/char.
	const pPrompt = price(m?.pricing?.prompt);
	const pCompletion = price(m?.pricing?.completion) ?? 0;
	if (pPrompt === undefined) warn('live TTS pricing unavailable: using a conservative fallback estimate');
	const estimateFor = (chars: number): number => pPrompt === undefined ? chars * 0.00003 : chars * pPrompt + (chars / 12) * 32 * pCompletion;
	const estimates = todo.map((t) => estimateFor(t.scene.narration!.trim().length));
	const total = estimates.reduce((a, b) => a + b, 0);
	info(`voice: ${voice ?? '(provider default)'} · language guess: ${lang} · model: ${model} · ${todo.length} scene(s)`);
	const retry = `node cli/nolan.ts ai tts ${slug}${only ? ` --scene ${only}` : ''}${str(flags, 'voice') ? ` --voice ${voice}` : ''}${str(flags, 'model') ? ` --model ${model}` : ''}`;
	if (!(await gate(key, total, `${todo.length} voice-over(s)`, flags, retry))) return;

	const dir = join(publicProjectDir(slug), 'voice');
	mkdirSync(dir, { recursive: true });
	for (const [i, { scene, inputHash }] of todo.entries()) {
		const bytes = await paid({ project: slug, step: `tts:${scene.id}`, model, kind: 'tts', estUsd: estimates[i] }, async () => {
			const res = await request('/audio/speech', { key, body: { model, input: scene.narration!.trim(), ...(voice ? { voice } : {}), response_format: 'mp3' } });
			const buf = Buffer.from(await res.arrayBuffer());
			if (!buf.length) throw new Error('OpenRouter returned empty audio');
			const genId = res.headers.get('x-generation-id') ?? undefined;
			return { result: buf, genId, actualUsd: genId ? await generationCost(key, genId) : null };
		});
		const file = join(dir, `${scene.id}.mp3`);
		writeFileSync(file, bytes);
		const seconds = await probeDuration(file);
		const src = `projects/${slug}/voice/${scene.id}.mp3`;
		// Re-read so earlier iterations (and concurrent edits) are kept; one save per scene keeps paid work on crash.
		scenario = loadScenario(slug);
		const target = scenario.scenes.find((s) => s.id === scene.id)!;
		target.voiceSrc = src;
		const needed = Math.min(600, Math.ceil((seconds + 0.6) * 10) / 10);
		const extended = target.seconds < needed;
		if (extended) target.seconds = needed;
		scenario.audio.voice.enabled = true; // starter scenarios ship with voice off
		saveScenario(slug, scenario);
		upsertLock(slug, generatedLock(`voice:${scene.id}`, 'voice', src, `Voice-over: ${scene.id}`, model,
			{ creator: `${model}${voice ? ` (${voice})` : ''}`, inputHash }));
		ok(`${scene.id}: ${seconds.toFixed(2)}s voice → ${src}${extended ? ` (scene extended to ${needed}s)` : ''}`);
	}
	next(`node cli/nolan.ts validate ${slug}`);
};

// ------------------------------------------------------------------ image

const image = async (pos: string[], flags: Flags): Promise<void> => {
	const usage = 'node cli/nolan.ts ai image <slug> <sceneId> --prompt "..." [--model M] [--dry-run] [--yes]';
	const slug = slugArg(pos, usage);
	const sceneId = pos[1] ?? fail('missing <sceneId>', usage);
	const prompt = str(flags, 'prompt') ?? fail('missing --prompt', usage);
	const scenario = loadScenario(slug);
	const scene = scenario.scenes.find((s) => s.id === sceneId) ?? fail(`no scene "${sceneId}"`, `scene ids: ${scenario.scenes.map((s) => s.id).join(', ')}`);
	const key = requireKey();
	const model = str(flags, 'model') ?? readConfig().imageModel;

	const endpoints = await imageEndpoints(model);
	let estimate = endpoints ? imageEstimate(endpoints) : undefined;
	if (estimate === undefined) { warn('live image pricing unavailable: using a conservative $0.08 estimate'); estimate = 0.08; }
	const params = endpoints?.[0]?.supported_parameters ?? {};
	const aspect = scenario.format;
	const aspectOk = !endpoints || params.aspect_ratio?.values?.includes(aspect);
	if (!aspectOk) warn(`${model} does not accept aspect_ratio ${aspect}; the image may need cropping (it is rendered with object-fit: cover)`);
	const png = params.output_format?.values?.includes('png');
	const retry = `node cli/nolan.ts ai image ${slug} ${sceneId} --prompt ${JSON.stringify(prompt)}${str(flags, 'model') ? ` --model ${model}` : ''}`;
	if (!(await gate(key, estimate, `1 image (${model}, ${aspect})`, flags, retry))) return;

	const img = await paid({ project: slug, step: `image:${sceneId}`, model, kind: 'image', estUsd: estimate }, async () => {
		const res = await request('/images', { key, body: { model, prompt, ...(aspectOk ? { aspect_ratio: aspect } : {}), ...(png ? { output_format: 'png' } : {}) } });
		const j = await res.json() as { id?: string; data?: { b64_json?: string; media_type?: string }[]; usage?: { cost?: number } };
		const first = j.data?.[0];
		return { result: { bytes: Buffer.from(first?.b64_json ?? '', 'base64'), mime: first?.media_type, raw: j }, actualUsd: j.usage?.cost ?? null, genId: j.id };
	});
	// Checked after settling: a 200 may be billed even when the payload is unusable.
	if (!img.bytes.length) fail(`unexpected /images response (no data[0].b64_json): ${JSON.stringify(img.raw).slice(0, 200)}`, 'retry, or try another --model');
	const src = `projects/${slug}/images/${sceneId}.${extFor(img.mime, 'png')}`;
	mkdirSync(join(publicProjectDir(slug), 'images'), { recursive: true });
	writeFileSync(join(publicProjectDir(slug), 'images', `${sceneId}.${extFor(img.mime, 'png')}`), img.bytes);
	const field = scene.type === 'image' ? 'image' : 'background';
	updateScenario(slug, (s) => {
		const sc = s.scenes.find((x) => x.id === sceneId) ?? fail(`scene "${sceneId}" was removed meanwhile`, `the image is saved at public/${src}`);
		sc[sc.type === 'image' ? 'image' : 'background'] = src;
	});
	upsertLock(slug, generatedLock(`image:${sceneId}`, 'image', src, prompt.slice(0, 80), model));
	ok(`${sceneId}.${field} = ${src} (${(img.bytes.length / 1024).toFixed(0)} KB)`);
	next(`node cli/nolan.ts stills ${slug}`);
};

// ------------------------------------------------------------------ critique

type Critique = {
	summary?: string;
	strengths?: string[];
	issues?: { severity?: string; sceneId?: string; problem?: string; why?: string }[];
	edits?: { op?: string; path?: string; value?: unknown; reason?: string }[];
};

const SYSTEM = `You are a senior motion designer and technical storyteller reviewing a short video scenario rendered with Remotion.
The scenario JSON follows a fixed schema: scene types ${SCENE_TYPES.join(', ')}; theme presets ${THEME_PRESETS.join(', ')}.
Judge: hook in the first 3 seconds, pacing (reading time >= words/3.5 s), one idea per scene, visual variety, accuracy against the repo facts, narration quality, ending/CTA.
Reply with ONE JSON object only:
{"summary": string,
 "strengths": string[],
 "issues": [{"severity": "high"|"medium"|"low", "sceneId": string|null, "problem": string, "why": string}],
 "edits": [{"op": "replace"|"add"|"remove", "path": JSON-pointer into the scenario e.g. "/scenes/2/seconds", "value": any, "reason": string}]}
Edits must be concrete and keep the scenario valid. At most 12 issues and 15 edits.`;

const readIf = (file: string, max: number): string => existsSync(file) ? readFileSync(file, 'utf8').slice(0, max) : '(none)';

export const critiqueMarkdown = (slug: string, model: string, c: Critique, costUsd: number | null): string => [
	`# Critique of ${slug}`,
	'',
	`Model: ${model} · ${new Date().toISOString().slice(0, 10)}${costUsd !== null ? ` · cost ${usd(costUsd)}` : ''}. Second opinion only: decide with the user what to apply.`,
	'',
	...(c.summary ? [c.summary, ''] : []),
	'## Strengths', '', ...(c.strengths?.length ? c.strengths.map((s) => `- ${s}`) : ['- (none listed)']), '',
	'## Issues', '', ...(c.issues?.length ? c.issues.map((i) => `- **${i.severity ?? '?'}**${i.sceneId ? ` \`${i.sceneId}\`` : ''}: ${i.problem ?? ''}${i.why ? ` (${i.why})` : ''}`) : ['- (none listed)']), '',
	'## Edits', '', '```json', JSON.stringify(c.edits ?? [], null, 2), '```', '',
].join('\n');

const critique = async (pos: string[], flags: Flags): Promise<void> => {
	const slug = slugArg(pos, 'node cli/nolan.ts ai critique <slug> [--model M] [--dry-run] [--yes]');
	const scenario = loadScenario(slug);
	const key = requireKey();
	const model = str(flags, 'model') ?? readConfig().critiqueModel;
	const dir = projectDir(slug);
	const user = [
		'## Brief', readIf(join(dir, 'brief.md'), 8000),
		'## Repo facts (JSON, truncated)', readIf(join(dir, 'repo-facts.json'), 20000),
		'## Scenario', JSON.stringify(scenario, null, 1),
	].join('\n\n');
	const maxTokens = 4000;
	const m = await findModel(model);
	const pIn = price(m?.pricing?.prompt);
	const pOut = price(m?.pricing?.completion);
	if (pIn === undefined || pOut === undefined) warn('live chat pricing unavailable: using a conservative fallback estimate');
	// ponytail: ~3 chars/token (conservative) + full max_tokens output.
	const estimate = ((SYSTEM.length + user.length) / 3) * (pIn ?? 0.000005) + maxTokens * (pOut ?? 0.00002);
	const retry = `node cli/nolan.ts ai critique ${slug}${str(flags, 'model') ? ` --model ${model}` : ''}`;
	if (!(await gate(key, estimate, `1 critique (${model})`, flags, retry))) return;

	let cost: number | null = null;
	const content = await paid({ project: slug, step: 'critique', model, kind: 'chat', estUsd: estimate }, async () => {
		const res = await request('/chat/completions', { key, body: {
			model, max_tokens: maxTokens, response_format: { type: 'json_object' },
			messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
		} });
		const j = await res.json() as { id?: string; choices?: { message?: { content?: string } }[]; usage?: { cost?: number } };
		cost = j.usage?.cost ?? null;
		return { result: j.choices?.[0]?.message?.content ?? '', actualUsd: cost, genId: j.id };
	});
	let parsed: Critique | undefined;
	try { parsed = JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')) as Critique; } catch { /* keep raw */ }
	const file = join(dir, 'critique.md');
	if (parsed) writeFileSync(file, critiqueMarkdown(slug, model, parsed, cost));
	else {
		warn('the model did not return valid JSON: raw answer saved');
		writeFileSync(file, `# Critique of ${slug}\n\nModel: ${model} (raw, unparsed answer)\n\n${content}\n`);
	}
	ok(`projects/${slug}/critique.md${parsed ? ` (${parsed.strengths?.length ?? 0} strengths, ${parsed.issues?.length ?? 0} issues, ${parsed.edits?.length ?? 0} edits)` : ''}`);
	next(`read projects/${slug}/critique.md, agree edits with the user, then node cli/nolan.ts validate ${slug}`);
};

// ------------------------------------------------------------------ music (experimental)

// Container from magic bytes; undefined when unknown.
const audioExt = (b: Buffer): string | undefined =>
	b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) ? 'mp3'
	: b.subarray(0, 4).toString('latin1') === 'RIFF' ? 'wav'
	: b.subarray(0, 4).toString('latin1') === 'OggS' ? 'ogg'
	: b.subarray(0, 4).toString('latin1') === 'fLaC' ? 'flac'
	: undefined;

type AudioChunk = { id?: string; usage?: { cost?: number }; choices?: { delta?: { audio?: { data?: string } }; message?: { audio?: { data?: string } } }[] };

// The response shape is UNVERIFIED (docs/research/openrouter.md §5): accept SSE (delta.audio.data) or JSON (message.audio.data).
const collectAudio = async (res: Response): Promise<{ bytes: Buffer; cost: number | null; id?: string }> => {
	const text = await res.text();
	const parse = (t: string): AudioChunk[] => { try { return [JSON.parse(t) as AudioChunk]; } catch { return []; } };
	const chunks = text.trimStart().startsWith('data:') || text.includes('\ndata:')
		? text.split('\n').filter((l) => l.startsWith('data:') && !l.includes('[DONE]')).flatMap((l) => parse(l.slice(5)))
		: parse(text);
	const parts: Buffer[] = []; // decode per chunk: each chunk may carry its own base64 padding
	let cost: number | null = null;
	let id: string | undefined;
	for (const c of chunks) {
		const ch = c.choices?.[0];
		parts.push(Buffer.from(ch?.delta?.audio?.data ?? ch?.message?.audio?.data ?? '', 'base64'));
		cost = c.usage?.cost ?? cost;
		id = c.id ?? id;
	}
	return { bytes: Buffer.concat(parts), cost, id };
};

const music = async (pos: string[], flags: Flags): Promise<void> => {
	const slug = slugArg(pos, 'node cli/nolan.ts ai music <slug> [--prompt "..."] [--model M] [--dry-run] [--yes]');
	const scenario: Scenario = loadScenario(slug);
	const key = requireKey();
	const model = str(flags, 'model') ?? readConfig().musicModel;
	warn('EXPERIMENTAL: AI music via OpenRouter chat audio output; the response format is unverified and may change');
	const mood = scenario.audio.music.mood.join(', ') || 'cinematic, modern, confident';
	const bpm = scenario.audio.music.bpm ? `${scenario.audio.music.bpm[0]}-${scenario.audio.music.bpm[1]} BPM` : '';
	const prompt = str(flags, 'prompt') ?? `30 second seamless loopable background music bed for a product video, ${mood}${bpm ? `, ${bpm}` : ''}. Instrumental, no vocals.`;
	// Per-token price is "0" for Lyria (billed per clip): hardcoded clip/song prices.
	const estimate = model.includes('pro') ? 0.08 : 0.04;
	info(`prompt: ${prompt}`);
	const retry = `node cli/nolan.ts ai music ${slug}${str(flags, 'model') ? ` --model ${model}` : ''}`;
	if (!(await gate(key, estimate, `1 music clip (${model})`, flags, retry))) return;

	const out = await paid({ project: slug, step: 'music', model, kind: 'music', estUsd: estimate }, async () => {
		const res = await request('/chat/completions', { key, body: {
			model, modalities: ['text', 'audio'], stream: true, messages: [{ role: 'user', content: prompt }],
		} });
		const r = await collectAudio(res);
		return { result: { bytes: r.bytes, ext: audioExt(r.bytes) }, actualUsd: r.cost ?? (r.id ? await generationCost(key, r.id) : null), genId: r.id };
	});
	// Checked after settling (a 200 may be billed): stop loudly instead of saving garbage.
	if (!out.ext) fail(`unexpected music response (${out.bytes.length} bytes, unknown container): this experimental endpoint may have changed`, 'use free music instead: node cli/nolan.ts audio music ' + slug);
	const src = `projects/${slug}/audio/music-ai.${out.ext}`;
	mkdirSync(join(publicProjectDir(slug), 'audio'), { recursive: true });
	writeFileSync(join(publicProjectDir(slug), 'audio', `music-ai.${out.ext}`), out.bytes);
	updateScenario(slug, (s) => { s.audio.music.src = src; });
	// Same id as free music: one music slot, so switching sources never leaves a stale credit.
	upsertLock(slug, generatedLock('music', 'music', src, 'AI music bed (experimental)', model,
		{ license: 'generated (Google Lyria terms apply, SynthID watermark)' }));
	ok(`audio.music.src = ${src} (experimental; listen before shipping)`);
	next(`node cli/nolan.ts studio ${slug}`);
};

// ------------------------------------------------------------------ dispatch

const SUBS: Record<string, (pos: string[], flags: Flags) => Promise<void>> = { status: (_p, f) => status(f), tts, image, critique, music };

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args, BOOLEANS);
	const [sub, ...pos] = _;
	const fn = SUBS[sub ?? 'status'] ?? fail(`unknown ai subcommand "${sub}"`, 'node cli/nolan.ts ai status|tts|image|critique|music');
	await fn(pos, flags);
};

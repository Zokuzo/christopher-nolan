// Minimal OpenRouter client (fetch only). Base URL overridable with OPENROUTER_BASE_URL (tests use a fake server).
import { loadEnv } from '../lib/config.ts';
import { fail } from '../lib/log.ts';

export const baseUrl = (): string => (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

export const getKey = (): string | undefined => loadEnv().OPENROUTER_API_KEY;

export const NO_KEY_HELP = 'AI features are optional: the base flow (scenario, free music/sfx, Studio, render) works without a key.';
export const requireKey = (): string =>
	getKey() ?? fail(`no OpenRouter key. ${NO_KEY_HELP}`,
		'get a key at https://openrouter.ai/keys (tip: a dedicated key with a credit limit), then: node cli/nolan.ts config set-key');

export type HttpError = Error & { status: number };

const headers = (key?: string, json = false): Record<string, string> => ({
	...(key ? { Authorization: `Bearer ${key}` } : {}),
	...(json ? { 'Content-Type': 'application/json' } : {}),
	'HTTP-Referer': 'https://github.com/Zokuzo/christopher-nolan',
	'X-Title': 'Christopher Nolan',
});

const httpError = async (res: Response, path: string): Promise<HttpError> => {
	const text = (await res.text().catch(() => '')).slice(0, 500);
	let msg = text;
	try { msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text; } catch { /* not JSON */ }
	const err = new Error(res.status === 402
		? `OpenRouter 402 (out of credits or key limit reached): hard stop, nothing retried. ${msg}\nfix: add credits or raise the key limit at https://openrouter.ai/settings/keys`
		: `OpenRouter ${res.status} on ${path}: ${msg}`) as HttpError;
	err.status = res.status;
	return err;
};

// Throws HttpError on non-2xx; returns the raw Response otherwise.
export const request = async (path: string, init: { key?: string; body?: unknown; method?: string } = {}): Promise<Response> => {
	const res = await fetch(baseUrl() + path, {
		method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
		headers: headers(init.key, init.body !== undefined),
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
		signal: AbortSignal.timeout(300_000), // image models can take ~90 s
	});
	if (!res.ok) throw await httpError(res, path);
	return res;
};

export const getJson = async <T>(path: string, key?: string): Promise<T> => (await request(path, { key })).json() as Promise<T>;

// --- discovery & pricing -------------------------------------------------------------------------

export type ModelInfo = {
	id: string;
	pricing?: { prompt?: string; completion?: string };
	supported_voices?: string[] | null;
	architecture?: { output_modalities?: string[] };
};

// `query` e.g. '?output_modalities=speech' (speech models are not in the default text listing).
export const listModels = async (query = ''): Promise<ModelInfo[]> =>
	(await getJson<{ data: ModelInfo[] }>(`/models${query}`, getKey())).data;

// Live model entry, or undefined when the listing is unreachable. Fails with candidates when the id is unknown.
export const findModel = async (id: string, query = ''): Promise<ModelInfo | undefined> => {
	let models: ModelInfo[];
	try { models = await listModels(query); }
	catch { return undefined; }
	return models.find((m) => m.id === id) ?? fail(`model "${id}" not found on OpenRouter (model ids change often)`,
		`pass --model with one of: ${models.slice(0, 8).map((m) => m.id).join(', ')}`);
};

// USD per unit, or undefined when missing/variable (OpenRouter uses "-1" for variable pricing).
export const price = (v: string | undefined): number | undefined => {
	const n = Number(v);
	return v !== undefined && Number.isFinite(n) && n >= 0 ? n : undefined;
};

type ImageEndpoint = { supported_parameters?: Record<string, { type: string; values?: string[] }>; pricing?: { billable: string; unit: string; cost_usd: number }[] };

// ponytail: rough per-unit sizes (1920x1080 ≈ 2.1 MP, ~1.5k tokens/image); settle() records the real cost.
const UNIT_QTY: Record<string, number> = { image: 1, megapixel: 2.1, token: 1500 };

// Conservative per-image estimate: per endpoint, max cost per billable across variants, summed; max across endpoints.
export const imageEstimate = (endpoints: ImageEndpoint[]): number | undefined => {
	let best: number | undefined;
	for (const ep of endpoints) {
		const perBillable = new Map<string, number>();
		for (const p of ep.pricing ?? []) {
			const qty = UNIT_QTY[p.unit];
			if (qty === undefined || !Number.isFinite(p.cost_usd)) continue;
			perBillable.set(p.billable, Math.max(perBillable.get(p.billable) ?? 0, p.cost_usd * qty));
		}
		if (!perBillable.size) continue;
		const total = [...perBillable.values()].reduce((a, b) => a + b, 0);
		best = Math.max(best ?? 0, total);
	}
	return best;
};

// Endpoints of an image model; fails with candidates on 404; undefined when unreachable.
export const imageEndpoints = async (id: string): Promise<ImageEndpoint[] | undefined> => {
	try {
		return (await getJson<{ endpoints: ImageEndpoint[] }>(`/images/models/${id}/endpoints`, getKey())).endpoints;
	} catch (e) {
		if ((e as HttpError).status !== 404) return undefined;
		const models = await getJson<{ data: { id: string }[] }>('/images/models', getKey()).then((r) => r.data, () => []);
		return fail(`image model "${id}" not found on OpenRouter`, `pass --model with one of: ${models.slice(0, 8).map((m) => m.id).join(', ') || 'see https://openrouter.ai/models?output_modalities=image'}`);
	}
};

// --- key & generation ----------------------------------------------------------------------------

export type KeyInfo = { limit: number | null; limit_remaining: number | null; usage?: number; is_free_tier?: boolean };
export const keyInfo = async (key: string): Promise<KeyInfo> => (await getJson<{ data: KeyInfo }>('/key', key)).data;

// Actual cost of a generation (TTS has no inline cost). Retries 1,2,4,8 s; null if still unknown.
export const generationCost = async (key: string, genId: string, delays = [1000, 2000, 4000, 8000]): Promise<number | null> => {
	for (let i = 0; ; i++) {
		try {
			const cost = (await getJson<{ data: { total_cost?: number } }>(`/generation?id=${encodeURIComponent(genId)}`, key)).data.total_cost;
			if (typeof cost === 'number') return cost;
		} catch { /* 404 while the generation is indexed */ }
		if (i >= delays.length) return null;
		await new Promise((r) => setTimeout(r, delays[i]));
	}
};

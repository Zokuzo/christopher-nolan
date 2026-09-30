// Size/duration from the scenario, plus derived props (never persisted; `nolan sync` strips `_*`):
//   _tokens  shiki tokens per code scene      _credits  assets.lock.json entries for the outro
//   _sfx     sfx name -> public path          _assets   which referenced local files exist
import type { CalculateMetadataFunction } from 'remotion';
import { staticFile } from 'remotion';
import { bundledLanguages, codeToTokens } from 'shiki';
import type { Scenario } from './schema.ts';
import { formatSize, totalFrames } from './lib/timing.ts';
import { resolveTheme } from './theme/theme.tsx';

export type CodeTokens = { fg: string; bg: string; lines: [string, string, number][][] }; // [text, color, fontStyle]
export type Credit = { kind: string; title: string; creator?: string; license?: string; attribution?: string; sourceUrl?: string };
export type Derived = {
	_tokens?: Record<string, CodeTokens>;
	_credits?: Credit[];
	_sfx?: Record<string, string>;
	_assets?: Record<string, boolean>;
};
export type VideoProps = Scenario & Derived;

// Local asset path ("public/x.png", "/x.png", "x.png") -> path under public/. URLs pass through.
export const publicPath = (p: string): string => p.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^public\//, '');
export const isRemote = (p: string): boolean => /^(https?:|data:)/.test(p);
export const assetSrc = (p: string): string => (isRemote(p) ? p : staticFile(publicPath(p)));

const getJson = async (path: string, signal?: AbortSignal): Promise<unknown> => {
	try {
		const res = await fetch(staticFile(path), { signal });
		return res.ok ? await res.json() : null;
	} catch {
		return null;
	}
};

const exists = async (path: string, signal?: AbortSignal): Promise<boolean> => {
	if (isRemote(path)) return true;
	try {
		const res = await fetch(staticFile(publicPath(path)), { method: 'HEAD', signal });
		return res.ok;
	} catch {
		return false;
	}
};

type LockEntry = Partial<Record<'id' | 'name' | 'kind' | 'file' | 'title' | 'creator' | 'license' | 'licenseUrl' | 'attribution' | 'sourceUrl' | 'provider', string>>;

const lockEntries = (lock: unknown): LockEntry[] => {
	const list = Array.isArray(lock) ? lock : (lock as { entries?: unknown; assets?: unknown } | null)?.entries ?? (lock as { assets?: unknown } | null)?.assets;
	return Array.isArray(list) ? list.filter((e) => e && typeof e === 'object') : [];
};

export const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props, abortSignal }) => {
	const theme = resolveTheme(props.theme);
	const scenes = props.scenes ?? [];

	const _tokens: Record<string, CodeTokens> = {};
	for (const scene of scenes) {
		if (scene.type !== 'code' || !scene.code) continue;
		const lang = scene.lang && scene.lang in bundledLanguages ? scene.lang : 'text';
		try {
			const r = await codeToTokens(scene.code.replace(/\t/g, '  '), { lang: lang as 'text', theme: theme.codeTheme as 'vitesse-dark' });
			_tokens[scene.id] = {
				fg: r.fg ?? theme.color.text,
				bg: r.bg ?? theme.color.surface,
				lines: r.tokens.map((line) => line.map((t) => [t.content, t.color ?? r.fg ?? '', t.fontStyle ?? 0])),
			};
		} catch (err) {
			console.warn(`[nolan] highlighting failed for scene ${scene.id}`, err);
		}
	}

	const slug = /^[a-z0-9][a-z0-9-]*$/.test(props.slug ?? '') ? props.slug : '';
	const entries = slug ? lockEntries(await getJson(`projects/${slug}/assets.lock.json`, abortSignal)) : [];
	const _credits: Credit[] = entries
		.filter((e) => e.title || e.attribution)
		.map((e) => ({ kind: e.kind ?? 'asset', title: e.title ?? '', creator: e.creator, license: e.license, attribution: e.attribution, sourceUrl: e.sourceUrl }));

	// SFX: bundled manifest wins; project-fetched files (sfx-<name>.mp3 in the lock) fill the gaps.
	const sfx: Record<string, string> = {};
	for (const e of entries) {
		const name = e.name ?? e.id?.match(/^sfx-(.+)$/)?.[1] ?? e.file?.match(/sfx-([\w-]+)\.\w+$/)?.[1];
		if (e.kind === 'sfx' && e.file && name) sfx[name] = publicPath(e.file);
	}
	const manifest = await getJson('sfx/index.json', abortSignal);
	if (manifest && typeof manifest === 'object') {
		for (const [name, v] of Object.entries(manifest as Record<string, unknown>)) {
			const file = typeof v === 'string' ? v : (v as { file?: string } | null)?.file;
			if (file) sfx[name] = file.includes('/') ? publicPath(file) : `sfx/${file}`;
		}
	}

	const paths = new Set<string>(Object.values(sfx));
	if (props.audio?.music?.src) paths.add(props.audio.music.src);
	for (const s of scenes) for (const p of [s.voiceSrc, s.background, s.image, s.before, s.after]) if (p && /\.\w{2,5}$/.test(p)) paths.add(p);
	const _assets: Record<string, boolean> = {};
	await Promise.all([...paths].map(async (p) => { _assets[p] = await exists(p, abortSignal); }));
	const _sfx = Object.fromEntries(Object.entries(sfx).filter(([, p]) => _assets[p]));

	return {
		...formatSize(props.format ?? '16:9'),
		fps: props.fps ?? 30,
		durationInFrames: totalFrames({ ...props, scenes }),
		props: { ...props, _tokens, _credits, _sfx, _assets },
	};
};

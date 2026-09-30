// Render-side theme: preset + scenario overrides, Google Fonts loading, motion + layout helpers.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Easing, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { getAvailableFonts } from '@remotion/google-fonts';
import type { Scenario } from '../schema.ts';
import { ENERGY_SPRINGS, PRESETS, type Theme } from './presets.ts';

export type { Theme };

// Scenario.theme (possibly blanked by Studio users) -> full Theme.
export const resolveTheme = (t: Partial<Scenario['theme']> | undefined): Theme => {
	const base = PRESETS[t?.preset as keyof typeof PRESETS] ?? PRESETS.interstellar;
	const bg = t?.background || base.color.bg;
	const text = t?.text || base.color.text;
	return {
		...base,
		color: {
			...base.color,
			bg,
			text,
			accent: t?.accent || base.color.accent,
			// Derive surfaces from overrides so a custom background never clashes with the preset's panels.
			surface: t?.background ? `color-mix(in srgb, ${bg} 92%, ${text})` : base.color.surface,
			muted: t?.background || t?.text ? `color-mix(in srgb, ${text} 58%, ${bg})` : base.color.muted,
		},
		font: {
			display: t?.displayFont || base.font.display,
			body: t?.bodyFont || base.font.body,
			mono: t?.monoFont || base.font.mono,
		},
		grain: typeof t?.grain === 'number' ? t.grain : base.grain,
		motion: { ...base.motion, spring: (t?.energy && ENERGY_SPRINGS[t.energy]) || base.motion.spring },
	};
};

const ThemeContext = createContext<Theme>(PRESETS.interstellar);
export const ThemeProvider = ThemeContext.Provider;
export const useTheme = (): Theme => useContext(ThemeContext);

// CSS font-family stacks (family name first, generic fallback second).
export const fontStack = (theme: Theme) => ({
	display: `"${theme.font.display}", ${theme.font.body === theme.font.display ? 'sans-serif' : `"${theme.font.body}", sans-serif`}`,
	body: `"${theme.font.body}", system-ui, sans-serif`,
	mono: `"${theme.font.mono}", ui-monospace, monospace`,
});

const WANTED_WEIGHTS = ['400', '500', '700'];

// Loads the three theme families from @remotion/google-fonts (matched by family name, so any
// Google font typed in Studio works) and returns the theme with the CSS family names Remotion
// actually registered ("Press Start 2P" loads as "Press Start TwoP"). Unknown names fall back.
export const useFonts = (theme: Theme): Theme => {
	const key = [theme.font.display, theme.font.body, theme.font.mono].join('|');
	const [handle] = useState(() => delayRender(`fonts ${key}`));
	const [loaded, setLoaded] = useState<{ key: string; map: Record<string, string> } | null>(null);
	useEffect(() => {
		const available = getAvailableFonts();
		const map: Record<string, string> = {};
		Promise.all([...new Set(key.split('|'))].map(async (name) => {
			const entry = available.find((f) => f.fontFamily.toLowerCase() === name.toLowerCase());
			if (!entry) return console.warn(`[nolan] font "${name}" is not a Google font, using fallback`);
			const mod = await entry.load();
			const has = Object.keys(mod.getInfo().fonts.normal ?? {});
			const weights = WANTED_WEIGHTS.filter((w) => has.includes(w));
			const subsets = mod.getInfo().subsets.filter((s) => s === 'latin' || s === 'latin-ext');
			const font = mod.loadFont('normal', {
				weights: weights.length ? weights : has,
				subsets: subsets.length ? subsets : undefined,
				ignoreTooManyRequestsWarning: true,
			});
			await font.waitUntilDone();
			map[name] = font.fontFamily;
		})).catch((err) => console.warn('[nolan] font loading failed', err))
			.finally(() => setLoaded({ key, map }));
	}, [key]);
	// Release the render only once the resolved names are committed.
	const released = useRef(false);
	useEffect(() => {
		if (loaded && !released.current) { released.current = true; continueRender(handle); }
	}, [loaded, handle]);
	const map = loaded?.map ?? {};
	return {
		...theme,
		font: {
			display: map[theme.font.display] ?? theme.font.display,
			body: map[theme.font.body] ?? theme.font.body,
			mono: map[theme.font.mono] ?? theme.font.mono,
		},
	};
};

// ---- motion -------------------------------------------------------------------------------

const quantize = (p: number, steps: number) => (steps > 0 ? Math.floor(p * steps) / steps : p);

// Spring 0 -> 1 starting at `delay` frames, with the theme's physics (and retro stepping).
export const useEnter = (delay = 0, durationInFrames?: number): number => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const p = spring({ frame: frame - delay, fps, config: theme.motion.spring, durationInFrames });
	return quantize(p, theme.motion.steps);
};

// Eased 0 -> 1 between two frames using the theme's cubic-bezier.
export const useEase = () => {
	const frame = useCurrentFrame();
	const theme = useTheme();
	const [a, b, c, d] = theme.motion.ease;
	const easing = Easing.bezier(a, b, c, d);
	return (from: number, to: number): number =>
		quantize(interpolate(frame, [from, Math.max(from + 1, to)], [0, 1], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }), theme.motion.steps);
};

// ---- layout -------------------------------------------------------------------------------

export type Layout = {
	width: number; height: number;
	portrait: boolean; square: boolean;
	pad: { top: number; right: number; bottom: number; left: number };
	inner: { width: number; height: number };
	u: number; // 1 at 1920 wide landscape; typography scale unit
};

// Title-safe margins: 96/72 px at 16:9; 9:16 keeps text inside the central 1080x1350 zone.
export const useLayout = (): Layout => {
	const { width, height } = useVideoConfig();
	const portrait = height > width * 1.2;
	const square = !portrait && width < height * 1.2;
	const s = width / (portrait || square ? 1080 : 1920);
	const pad = portrait
		? { top: 220 * s, right: 72 * s, bottom: 350 * s, left: 72 * s }
		: square
			? { top: 80 * s, right: 80 * s, bottom: 80 * s, left: 80 * s }
			: { top: 72 * s, right: 96 * s, bottom: 72 * s, left: 96 * s };
	return {
		width, height, portrait, square, pad,
		inner: { width: width - pad.left - pad.right, height: height - pad.top - pad.bottom },
		u: s * (portrait ? 1.1 : 1), // phones: bigger type
	};
};

// Font size so `text` fits on ~`lines` lines of `maxWidth` (charW = average glyph width in em).
export const fitSize = (text: string, maxWidth: number, max: number, min: number, charW = 0.58, lines = 1): number => {
	const longestWord = Math.max(1, ...text.split(/\s+/).map((w) => w.length));
	const perLine = Math.max(longestWord, Math.ceil(text.length / lines));
	return Math.max(min, Math.min(max, maxWidth / (perLine * charW)));
};

// Average glyph width (em) of the display font, for fitSize. Wide display faces need more room.
export const displayCharW = (theme: Theme): number =>
	/Press Start/i.test(theme.font.display) ? 1.05
	: /Cinzel|Archivo Black/i.test(theme.font.display) ? 0.72
	: /Instrument Serif|Bebas/i.test(theme.font.display) ? 0.45
	: 0.58;

// `*word*` -> accent-colored spans.
export const splitEmphasis = (text: string): { word: string; em: boolean }[] =>
	text.split(/\s+/).filter(Boolean).map((w) => {
		const em = /^\*.+\*[.,!?:;]*$/.test(w);
		return { word: em ? w.replace(/^\*/, '').replace(/\*([.,!?:;]*)$/, '$1') : w, em };
	});

// Relative luminance (0..1) of a #rgb/#rrggbb color; other formats count as dark.
export const luminance = (hex: string): number => {
	const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!m) return 0;
	const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Light backgrounds (editorial-light, brutalist) need softer glows/shadows and dark media scrims.
export const isLight = (theme: Theme): boolean => luminance(theme.color.bg) > 0.5;

// Display text style (one place to hang display-face tweaks).
export const displayFace = (theme: Theme) => ({ fontFamily: fontStack(theme).display });

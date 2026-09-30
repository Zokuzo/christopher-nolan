// Scenario schema shared by Remotion (Studio props panel) and the CLI (validation).
// Flat on purpose: Studio only has controls for plain objects/enums/optionals, not discriminated unions.
// No relative imports here so the CLI can load it under Node type-stripping.
import { z } from 'zod';
import { zColor, zTextarea } from '@remotion/zod-types';

export const SCENE_TYPES = [
	'title', 'kinetic', 'code', 'tree', 'diagram', 'terminal',
	'stats', 'bullets', 'quote', 'image', 'compare', 'outro',
] as const;
export const THEME_PRESETS = [
	'interstellar', 'neon-terminal', 'editorial-light', 'brutalist', 'retro-crt', 'clean-dark',
] as const;
// All verified as @remotion/transitions@4.0.530 presentations.
export const TRANSITIONS = [
	'fade', 'slide', 'wipe', 'flip', 'none', 'dreamyZoom', 'filmBurn', 'blurSlide',
] as const;
export const FORMATS = ['16:9', '9:16', '1:1'] as const;
export const ENERGIES = ['calm', 'medium', 'punchy'] as const;

const unit = () => z.number().min(0).max(1);

export const SceneSchema = z.object({
	id: z.string().min(1),
	type: z.enum(SCENE_TYPES),
	seconds: z.number().min(0.5).max(600),
	transition: z.enum(TRANSITIONS).optional(), // overrides the default for the cut AFTER this scene
	narration: zTextarea().optional(),
	voiceSrc: z.string().optional(),
	background: z.string().optional(),
	sfx: z.array(z.object({
		name: z.string(),
		at: z.number().min(0),
		volume: unit().optional(),
	})).optional(),
	// type-specific
	title: z.string().optional(),
	subtitle: z.string().optional(),
	text: zTextarea().optional(),
	bullets: z.array(z.string()).optional(),
	code: zTextarea().optional(),
	lang: z.string().optional(),
	filename: z.string().optional(),
	highlight: z.string().optional(), // "3-5,8"
	typing: z.boolean().optional(),
	tree: z.array(z.string()).optional(),
	focus: z.string().optional(),
	nodes: z.array(z.object({
		id: z.string(),
		label: z.string(),
		col: z.number(),
		row: z.number(),
	})).optional(),
	edges: z.array(z.object({
		from: z.string(),
		to: z.string(),
		label: z.string().optional(),
	})).optional(),
	commands: z.array(z.object({
		cmd: z.string(),
		output: zTextarea().optional(),
	})).optional(),
	stats: z.array(z.object({
		label: z.string(),
		value: z.number(),
		prefix: z.string().optional(),
		suffix: z.string().optional(),
	})).optional(),
	quote: zTextarea().optional(),
	author: z.string().optional(),
	image: z.string().optional(),
	before: z.string().optional(),
	after: z.string().optional(),
	cta: z.string().optional(),
	url: z.string().optional(),
});

// Nested object defaults are full literals: zod v4 `.default()` returns the value as-is
// (`.prefault()` would re-parse but Studio has no control for it).
const MUSIC_DEFAULT = { enabled: true, volume: 0.5, duckTo: 0.2, mood: [] as string[] };
const SFX_DEFAULT = { enabled: true, auto: true, volume: 0.5 };
const VOICE_DEFAULT = { enabled: true, volume: 1 };

export const ScenarioSchema = z.object({
	slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes'),
	title: z.string(),
	format: z.enum(FORMATS).default('16:9'),
	fps: z.number().int().min(1).max(120).default(30),
	theme: z.object({
		preset: z.enum(THEME_PRESETS).default('interstellar'),
		accent: zColor().optional(),
		background: zColor().optional(),
		text: zColor().optional(),
		displayFont: z.string().optional(), // Google Fonts family name, e.g. "Bebas Neue"
		bodyFont: z.string().optional(),
		monoFont: z.string().optional(),
		grain: unit().optional(),
		energy: z.enum(ENERGIES).optional(),
	}).default(() => ({ preset: 'interstellar' as const })),
	transition: z.object({
		type: z.enum(TRANSITIONS).default('fade'),
		frames: z.number().int().min(0).max(120).default(20),
	}).default(() => ({ type: 'fade' as const, frames: 20 })),
	audio: z.object({
		music: z.object({
			enabled: z.boolean().default(true),
			src: z.string().optional(), // path under public/
			volume: unit().default(0.5),
			duckTo: unit().default(0.2),
			mood: z.array(z.string()).default([]),
			bpm: z.tuple([z.number(), z.number()]).optional(),
		}).default(() => ({ ...MUSIC_DEFAULT, mood: [] })),
		sfx: z.object({
			enabled: z.boolean().default(true),
			auto: z.boolean().default(true),
			volume: unit().default(0.5),
		}).default(() => ({ ...SFX_DEFAULT })),
		voice: z.object({
			enabled: z.boolean().default(true),
			volume: unit().default(1),
		}).default(() => ({ ...VOICE_DEFAULT })),
	}).default(() => ({ music: { ...MUSIC_DEFAULT, mood: [] }, sfx: { ...SFX_DEFAULT }, voice: { ...VOICE_DEFAULT } })),
	scenes: z.array(SceneSchema).min(1),
	// Derived by calculateMetadata, never persisted (stripped by `nolan sync`).
	_tokens: z.any().optional(),
	_credits: z.any().optional(),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioInput = z.input<typeof ScenarioSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type SceneType = (typeof SCENE_TYPES)[number];
export type ThemePreset = (typeof THEME_PRESETS)[number];
export type Transition = (typeof TRANSITIONS)[number];
export type Format = (typeof FORMATS)[number];

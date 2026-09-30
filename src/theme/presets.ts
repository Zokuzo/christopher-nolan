// Theme presets as plain data (docs/research/design.md §3). Read by Remotion and the CLI: no imports.
// Fonts are Google Fonts family names; resolve them with getAvailableFonts() from @remotion/google-fonts.
// codeTheme ids verified against shiki@4.4.3 bundledThemes.

export type Spring = { damping: number; stiffness: number; mass: number };

export type Theme = {
	name: string;
	color: { bg: string; surface: string; text: string; muted: string; accent: string; accent2: string };
	font: { display: string; body: string; mono: string };
	codeTheme: string;
	radius: number;
	grain: number; // 0..1
	vignette: number; // 0..1
	scanlines: boolean;
	motion: {
		spring: Spring;
		ease: [number, number, number, number]; // cubic-bezier
		steps: number; // >0 = quantize progress into N steps (retro), 0 = smooth
		stagger: number; // frames
		transition: { type: 'fade' | 'slide' | 'wipe' | 'flip' | 'none' | 'dreamyZoom' | 'filmBurn' | 'blurSlide'; frames: number };
	};
	music: { moods: string[]; bpm: [number, number] };
};

// Energy override (scenario.theme.energy) -> spring.
export const ENERGY_SPRINGS: Record<'calm' | 'medium' | 'punchy', Spring> = {
	calm: { damping: 200, stiffness: 100, mass: 1 },
	medium: { damping: 20, stiffness: 120, mass: 1 },
	punchy: { damping: 12, stiffness: 220, mass: 1 },
};

export const PRESETS: Record<
	'interstellar' | 'neon-terminal' | 'editorial-light' | 'brutalist' | 'retro-crt' | 'clean-dark',
	Theme
> = {
	interstellar: {
		name: 'interstellar',
		color: { bg: '#07080A', surface: '#111317', text: '#E8E4DA', muted: '#8A8579', accent: '#D9A441', accent2: '#5B7C99' },
		font: { display: 'Cinzel', body: 'Inter', mono: 'JetBrains Mono' },
		codeTheme: 'vitesse-dark',
		radius: 10,
		grain: 0.15,
		vignette: 0.5,
		scanlines: false,
		motion: { spring: { damping: 200, stiffness: 80, mass: 1 }, ease: [0.16, 1, 0.3, 1], steps: 0, stagger: 5, transition: { type: 'fade', frames: 20 } },
		music: { moods: ['cinematic', 'ambient', 'pulsing synth', 'organ drone'], bpm: [90, 110] },
	},
	'neon-terminal': {
		name: 'neon-terminal',
		color: { bg: '#0A0E14', surface: '#111822', text: '#C7F9CC', muted: '#5E7D6A', accent: '#39FF88', accent2: '#FF2BD6' },
		font: { display: 'Space Grotesk', body: 'Inter', mono: 'Fira Code' },
		codeTheme: 'github-dark',
		radius: 8,
		grain: 0.08,
		vignette: 0.35,
		scanlines: false,
		motion: { spring: { damping: 14, stiffness: 160, mass: 1 }, ease: [0.22, 1, 0.36, 1], steps: 0, stagger: 2, transition: { type: 'slide', frames: 12 } },
		music: { moods: ['synthwave', 'cyberpunk', 'electronic'], bpm: [110, 128] },
	},
	'editorial-light': {
		name: 'editorial-light',
		color: { bg: '#F7F5F0', surface: '#FFFFFF', text: '#111111', muted: '#6B6760', accent: '#E4572E', accent2: '#2E4A62' },
		font: { display: 'Instrument Serif', body: 'Manrope', mono: 'IBM Plex Mono' },
		codeTheme: 'github-light',
		radius: 4,
		grain: 0.05,
		vignette: 0,
		scanlines: false,
		motion: { spring: { damping: 200, stiffness: 120, mass: 1 }, ease: [0.65, 0, 0.35, 1], steps: 0, stagger: 4, transition: { type: 'wipe', frames: 15 } },
		music: { moods: ['minimal', 'piano', 'lofi', 'corporate'], bpm: [80, 100] },
	},
	brutalist: {
		name: 'brutalist',
		color: { bg: '#FFFFFF', surface: '#F0F0F0', text: '#000000', muted: '#555555', accent: '#FF3B00', accent2: '#000000' },
		font: { display: 'Archivo Black', body: 'Space Mono', mono: 'Space Mono' },
		codeTheme: 'min-light',
		radius: 0,
		grain: 0,
		vignette: 0,
		scanlines: false,
		motion: { spring: { damping: 30, stiffness: 300, mass: 1 }, ease: [0.9, 0, 0.1, 1], steps: 0, stagger: 2, transition: { type: 'none', frames: 0 } },
		music: { moods: ['industrial', 'breakbeat', 'glitch'], bpm: [120, 140] },
	},
	'retro-crt': {
		name: 'retro-crt',
		color: { bg: '#1B1026', surface: '#2A1A3A', text: '#FFE8A3', muted: '#A08BB5', accent: '#FF6AD5', accent2: '#5CE1E6' },
		font: { display: 'Press Start 2P', body: 'VT323', mono: 'VT323' },
		codeTheme: 'dracula',
		radius: 0,
		grain: 0.2,
		vignette: 0.6,
		scanlines: true,
		motion: { spring: { damping: 20, stiffness: 200, mass: 1 }, ease: [0, 0, 1, 1], steps: 8, stagger: 3, transition: { type: 'fade', frames: 8 } },
		music: { moods: ['chiptune', '8-bit', 'retrowave'], bpm: [120, 150] },
	},
	'clean-dark': {
		name: 'clean-dark',
		color: { bg: '#0B0B0F', surface: '#16161D', text: '#FAFAFA', muted: '#8B8B98', accent: '#7C5CFF', accent2: '#22D3EE' },
		font: { display: 'Geist', body: 'Geist', mono: 'Geist Mono' },
		codeTheme: 'vesper',
		radius: 14,
		grain: 0.04,
		vignette: 0.25,
		scanlines: false,
		motion: { spring: { damping: 20, stiffness: 120, mass: 1 }, ease: [0.16, 1, 0.3, 1], steps: 0, stagger: 3, transition: { type: 'blurSlide', frames: 15 } },
		music: { moods: ['tech', 'upbeat electronic', 'future bass'], bpm: [100, 120] },
	},
};

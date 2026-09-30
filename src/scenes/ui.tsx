// Shared scene building blocks: shell (background + safe area), heading, window chrome, captions.
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Scene } from '../schema.ts';
import { assetSrc, type VideoProps } from '../calculate-metadata.ts';
import { sceneFrames } from '../lib/timing.ts';
import { type Theme, displayCharW, displayFace, fontStack, isLight, useEnter, useLayout, useTheme } from '../theme/theme.tsx';

export type SceneProps = { scene: Scene; props: VideoProps; index: number };

export const alpha = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// A referenced local file is usable unless calculateMetadata found it missing.
export const usable = (props: VideoProps, p?: string): p is string =>
	!!p && p.trim() !== '' && (props._assets?.[p] ?? true);

const KenBurnsImg = ({ src, frames, style }: { src: string; frames: number; style?: CSSProperties }) => {
	const frame = useCurrentFrame();
	const t = interpolate(frame, [0, frames], [0, 1], { extrapolateRight: 'clamp' });
	return (
		<Img src={src} style={{
			width: '100%', height: '100%', objectFit: 'cover',
			transform: `scale(${1 + 0.1 * t}) translate(${-1.5 * t}%, ${-1 * t}%)`, ...style,
		}} />
	);
};
export { KenBurnsImg };

// Background (theme bg, accent glow, optional image with scrim) + safe-area content box.
export const SceneShell = ({ scene, props, index, children, center = true, glow = true }: SceneProps & { children: ReactNode; center?: boolean; glow?: boolean }) => {
	const theme = useTheme();
	const layout = useLayout();
	const { fps } = useVideoConfig();
	const frames = sceneFrames(scene, fps);
	const bgImage = usable(props, scene.background) ? assetSrc(scene.background) : null;
	const gx = [30, 70, 50, 20, 80][index % 5];
	const light = isLight(theme);
	// Glow radii from the short side so 9:16 gets round pools of light, not tall banded ovals.
	const short = Math.min(layout.width, layout.height);
	const rx = Math.min(layout.width * 0.6, short * 0.95);
	const ry = Math.min(layout.height * 0.55, short * 0.7);
	return (
		// fontSynthesis style (no weight): single-weight faces (Instrument Serif, Archivo Black, Press Start 2P) never get smeared faux bold.
		<AbsoluteFill style={{ backgroundColor: theme.color.bg, color: theme.color.text, fontFamily: fontStack(theme).body, fontSynthesis: 'style' }}>
			{bgImage && (
				<AbsoluteFill>
					<KenBurnsImg src={bgImage} frames={frames} />
					<AbsoluteFill style={{ background: `linear-gradient(180deg, ${alpha(theme.color.bg, 55)} 0%, ${alpha(theme.color.bg, 82)} 60%, ${theme.color.bg} 100%)` }} />
				</AbsoluteFill>
			)}
			{glow && (
				<AbsoluteFill style={{
					// Light themes: a faint warm wash only (an accent2 pool reads as a grey smudge on paper).
					background: `radial-gradient(${rx}px ${ry}px at ${gx}% 38%, ${alpha(theme.color.accent, light ? 7 : 11)} 0%, ${alpha(theme.color.accent, light ? 3 : 5)} 40%, transparent 100%)`
						+ (light ? '' : `, radial-gradient(${rx * 0.85}px ${ry * 0.9}px at ${100 - gx}% 85%, ${alpha(theme.color.accent2, 8)} 0%, ${alpha(theme.color.accent2, 3)} 45%, transparent 100%)`),
				}} />
			)}
			<AbsoluteFill style={{
				padding: `${layout.pad.top}px ${layout.pad.right}px ${layout.pad.bottom}px ${layout.pad.left}px`,
				display: 'flex', flexDirection: 'column',
				justifyContent: center ? 'center' : 'flex-start',
			}}>
				{children}
			</AbsoluteFill>
			{scene.narration && scene.voiceSrc && props.audio?.voice?.enabled !== false && <Caption text={scene.narration} frames={frames} />}
		</AbsoluteFill>
	);
};

// Section heading: small accent rule + title + optional subtitle, springing in.
export const Heading = ({ title, subtitle, delay = 0, align = 'left', size = 1 }: { title?: string; subtitle?: string; delay?: number; align?: 'left' | 'center'; size?: number }) => {
	const theme = useTheme();
	const { u, portrait } = useLayout();
	const p = useEnter(delay);
	const q = useEnter(delay + theme.motion.stagger * 2);
	if (!title && !subtitle) return null;
	// Condensed faces (Instrument Serif, Bebas) look undersized at the shared size; very wide ones (Press Start) oversized.
	const cw = displayCharW(theme);
	const fs = (portrait ? 66 : 64) * u * size * (cw < 0.5 ? 1.22 : cw > 0.9 ? 0.82 : 1);
	return (
		<div style={{ textAlign: align, marginBottom: 44 * u, flexShrink: 0 }}>
			<div style={{
				width: 64 * u * p, height: 4 * u, background: theme.color.accent, borderRadius: 2,
				margin: align === 'center' ? `0 auto ${24 * u}px` : `0 0 ${24 * u}px`,
			}} />
			{title && (
				<div style={{
					...displayFace(theme), fontSize: fs, lineHeight: 1.08, fontWeight: 700,
					letterSpacing: '-0.01em', textWrap: 'balance',
					opacity: p, transform: `translateY(${(1 - p) * 28 * u}px)`,
				}}>{title}</div>
			)}
			{subtitle && (
				<div style={{
					marginTop: 16 * u, fontSize: 30 * u, color: theme.color.muted, lineHeight: 1.35, textWrap: 'balance',
					opacity: q, transform: `translateY(${(1 - q) * 16 * u}px)`,
				}}>{subtitle}</div>
			)}
		</div>
	);
};

// Drop shadow for panels: deep and soft on dark themes, light on paper, hard offset on square-cornered light themes (brutalist).
export const elevation = (theme: Theme, u: number, depth = 1): string => {
	if (!isLight(theme)) return `0 ${40 * u * depth}px ${120 * u * depth}px ${alpha('#000000', 45)}, 0 0 0 1px ${alpha('#000000', 20)}`;
	if (theme.radius === 0) return `${10 * u * depth}px ${10 * u * depth}px 0 ${theme.color.text}`;
	return `0 ${24 * u * depth}px ${64 * u * depth}px ${alpha('#000000', 10)}, 0 ${2 * u}px ${6 * u}px ${alpha('#000000', 6)}`;
};

// Window with three dots and a title bar (code editor / terminal / browser).
export const WindowFrame = ({ title, children, style, bg, bar }: { title?: ReactNode; children: ReactNode; style?: CSSProperties; bg?: string; bar?: ReactNode }) => {
	const theme = useTheme();
	const { u } = useLayout();
	return (
		<div style={{
			background: bg ?? theme.color.surface, borderRadius: theme.radius * 1.4 * u, overflow: 'hidden',
			border: isLight(theme) && theme.radius === 0 ? `${2 * u}px solid ${theme.color.text}` : `1px solid ${alpha(theme.color.text, 12)}`,
			boxShadow: elevation(theme, u),
			display: 'flex', flexDirection: 'column', ...style,
		}}>
			<div style={{
				height: 56 * u, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 * u, padding: `0 ${22 * u}px`,
				background: alpha(theme.color.text, 4), borderBottom: `1px solid ${alpha(theme.color.text, 8)}`,
			}}>
				{['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
					<div key={c} style={{ width: 15 * u, height: 15 * u, borderRadius: '50%', background: c, opacity: 0.9 }} />
				))}
				{bar ?? (title && (
					<div style={{ marginLeft: 18 * u, fontFamily: fontStack(theme).mono, fontSize: 22 * u, color: theme.color.muted }}>{title}</div>
				))}
			</div>
			{children}
		</div>
	);
};

// Subtitles for voiced narration: words appear in phrase-sized chunks across the scene.
const Caption = ({ text, frames }: { text: string; frames: number }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const words = text.split(/\s+/).filter(Boolean);
	const chunks: string[] = [];
	for (let i = 0; i < words.length; i += 8) chunks.push(words.slice(i, i + 8).join(' '));
	const speech = Math.max(1, frames - 0.6 * fps);
	const i = Math.min(chunks.length - 1, Math.floor((frame / speech) * chunks.length));
	if (i < 0 || !chunks[i] || frame > speech + 6) return null;
	return (
		<div style={{
			position: 'absolute', left: layout.pad.left, right: layout.pad.right,
			bottom: layout.portrait ? layout.pad.bottom - 120 * layout.u : 40 * layout.u,
			display: 'flex', justifyContent: 'center',
		}}>
			<div style={{
				background: alpha('#000000', 62), color: '#FFFFFF', fontFamily: fontStack(theme).body,
				fontSize: 30 * layout.u, lineHeight: 1.3, padding: `${10 * layout.u}px ${22 * layout.u}px`, borderRadius: 8 * layout.u,
				textAlign: 'center', maxWidth: '85%',
			}}>{chunks[i]}</div>
		</div>
	);
};

// Kinetic type: words rise out of a blur one by one; `*word*` is set in the accent color.
import { Fragment } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { displayFace, displayCharW, fitSize, splitEmphasis, useLayout, useTheme } from '../theme/theme.tsx';
import { SceneShell, type SceneProps } from './ui.tsx';

export const KineticScene = (p: SceneProps) => {
	const { scene } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const text = scene.text || scene.title || '';
	const words = splitEmphasis(text);
	const plain = words.map((w) => w.word).join(' ');
	const lines = layout.portrait ? 5 : plain.length > 60 ? 4 : 3;
	const size = fitSize(plain, layout.inner.width * 0.94, (layout.portrait ? 120 : 140) * layout.u, 48 * layout.u, displayCharW(theme), lines);
	const stagger = Math.max(2, Math.min(4, theme.motion.stagger));
	const push = interpolate(frame, [0, 240], [1, 1.04], { extrapolateRight: 'clamp' });

	return (
		<SceneShell {...p}>
			<div style={{
				...displayFace(theme), fontWeight: 700, fontSize: size, lineHeight: 1.12,
				letterSpacing: '-0.015em', textAlign: layout.portrait ? 'left' : 'center', textWrap: 'balance',
				transform: `scale(${push})`, transformOrigin: '50% 50%',
			}}>
				{words.map((w, i) => {
					const s = spring({ frame: frame - 4 - i * stagger, fps, config: theme.motion.spring, durationInFrames: 20 });
					const q = theme.motion.steps > 0 ? Math.floor(s * theme.motion.steps) / theme.motion.steps : s;
					return (
						// A real space between words (not a margin): correct word spacing in every face, incl. monospaced pixel fonts.
						<Fragment key={i}>{i > 0 && ' '}<span style={{
							display: 'inline-block',
							color: w.em ? theme.color.accent : theme.color.text,
							opacity: Math.min(1, q * 1.4),
							transform: `translateY(${(1 - q) * 40 * layout.u}px)`,
							filter: `blur(${(1 - q) * 8}px)`,
						}}>{w.word}</span></Fragment>
					);
				})}
			</div>
			{scene.subtitle && (
				<div style={{
					marginTop: 40 * layout.u, textAlign: layout.portrait ? 'left' : 'center', fontSize: 34 * layout.u,
					color: theme.color.muted, letterSpacing: '0.04em',
					opacity: interpolate(frame, [words.length * stagger + 10, words.length * stagger + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
				}}>{scene.subtitle}</div>
			)}
		</SceneShell>
	);
};

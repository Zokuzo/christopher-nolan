// Title card: slow push-in, letter-spacing collapse, anamorphic light streak, subtitle stagger.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { displayFace, displayCharW, fitSize, useEase, useEnter, useLayout, useTheme } from '../theme/theme.tsx';
import { SceneShell, alpha, type SceneProps } from './ui.tsx';

export const TitleScene = (p: SceneProps) => {
	const { scene, props } = p;
	const frame = useCurrentFrame();
	const theme = useTheme();
	const layout = useLayout();
	const ease = useEase();
	const title = scene.title || props.title || '';
	const enter = useEnter(0);
	const sub = useEnter(18 + theme.motion.stagger * 2);
	const track = ease(0, 40);
	const streak = ease(4, 34);
	const size = fitSize(title, layout.inner.width, (layout.portrait ? 150 : 168) * layout.u, 56 * layout.u, displayCharW(theme) + 0.08, layout.portrait ? 3 : 2);
	const drift = interpolate(frame, [0, 300], [0, 1], { extrapolateRight: 'clamp' });

	return (
		<SceneShell {...p} glow={false}>
			<AbsoluteFill style={{
				background: `radial-gradient(ellipse 70% 45% at 50% 50%, ${alpha(theme.color.accent, 13)} 0%, transparent 70%)`,
				opacity: enter,
			}} />
			<div style={{ textAlign: 'center', transform: `scale(${1.08 - 0.08 * enter + drift * 0.03})` }}>
				<div style={{
					...displayFace(theme), fontWeight: 700, fontSize: size, lineHeight: 1.05,
					letterSpacing: `${0.3 - 0.25 * track}em`, textWrap: 'balance',
					// letter-spacing pads the last glyph: re-center it.
					paddingLeft: `${0.3 - 0.25 * track}em`,
					opacity: enter, filter: `blur(${(1 - enter) * 10}px)`,
					textShadow: `0 0 ${60 * layout.u}px ${alpha(theme.color.accent, 25)}`,
				}}>{title}</div>
				{/* anamorphic streak */}
				<div style={{
					width: `${streak * 100}%`, height: 2 * layout.u, margin: `${size * 0.28}px auto 0`,
					background: `linear-gradient(90deg, transparent, ${alpha(theme.color.accent, 70)}, ${theme.color.text}, ${alpha(theme.color.accent, 70)}, transparent)`,
					opacity: interpolate(streak, [0, 0.4, 1], [0, 0.9, 0.3]),
					filter: `blur(${1.5 * layout.u}px)`,
				}} />
				{scene.subtitle && (
					<div style={{
						marginTop: size * 0.28, fontSize: (layout.portrait ? 38 : 36) * layout.u, color: theme.color.muted,
						letterSpacing: '0.22em', textTransform: 'uppercase', lineHeight: 1.4, textWrap: 'balance',
						opacity: sub, transform: `translateY(${(1 - sub) * 20 * layout.u}px)`,
					}}>{scene.subtitle}</div>
				)}
				{scene.text && (
					<div style={{
						marginTop: 28 * layout.u, fontSize: 32 * layout.u, color: theme.color.text, opacity: sub * 0.85,
						maxWidth: 1100 * layout.u, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.45, textWrap: 'balance',
					}}>{scene.text}</div>
				)}
			</div>
		</SceneShell>
	);
};

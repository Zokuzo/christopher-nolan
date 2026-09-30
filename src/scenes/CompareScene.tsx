// Before/after: images get a sweeping wipe divider; text gets two cards, "after" wiped in over a dimmed "before".
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { assetSrc } from '../calculate-metadata.ts';
import { sceneFrames } from '../lib/timing.ts';
import { displayFace, fontStack, useEnter, useLayout, useTheme } from '../theme/theme.tsx';
import { Heading, KenBurnsImg, SceneShell, alpha, usable, type SceneProps } from './ui.tsx';

const isImage = (s?: string) => !!s && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(s.trim());

const Tag = ({ children, accent }: { children: string; accent?: boolean }) => {
	const theme = useTheme();
	const { u } = useLayout();
	return (
		<span style={{
			fontFamily: fontStack(theme).mono, fontSize: 22 * u, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
			color: accent ? theme.color.bg : theme.color.muted, background: accent ? theme.color.accent : alpha(theme.color.text, 8),
			padding: `${8 * u}px ${16 * u}px`, borderRadius: 4 * u,
		}}>{children}</span>
	);
};

export const CompareScene = (p: SceneProps) => {
	const { scene, props } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const u = layout.u;
	const frames = sceneFrames(scene, fps);
	const enter = useEnter(0);
	const easing = Easing.bezier(0.65, 0, 0.35, 1);
	const w0 = Math.round(frames * 0.25);
	const w1 = Math.round(frames * 0.55);
	const wipe = interpolate(frame, [w0, w1], [0, 1], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

	if (isImage(scene.before) && isImage(scene.after)) {
		const pos = 100 - 50 * wipe; // divider sweeps from the right edge to the middle
		const img = (s?: string) => (usable(props, s) ? <KenBurnsImg src={assetSrc(s)} frames={frames} /> : <AbsoluteFill style={{ background: theme.color.surface }} />);
		return (
			<SceneShell {...p} center={false}>
				<Heading title={scene.title} subtitle={scene.subtitle} size={0.8} />
				<div style={{ position: 'relative', flex: 1, borderRadius: theme.radius * 1.4 * u, overflow: 'hidden', opacity: enter, border: `1px solid ${alpha(theme.color.text, 12)}` }}>
					<AbsoluteFill>{img(scene.before)}</AbsoluteFill>
					<AbsoluteFill style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>{img(scene.after)}</AbsoluteFill>
					<div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 4 * u, marginLeft: -2 * u, background: theme.color.accent, boxShadow: `0 0 ${30 * u}px ${theme.color.accent}` }} />
					<div style={{ position: 'absolute', top: 24 * u, left: 24 * u }}><Tag>Before</Tag></div>
					<div style={{ position: 'absolute', top: 24 * u, right: 24 * u, opacity: wipe }}><Tag accent>After</Tag></div>
				</div>
			</SceneShell>
		);
	}

	const vertical = layout.portrait;
	const card = (label: string, text: string, after: boolean) => (
		<div style={{
			flex: 1, position: 'relative', padding: `${44 * u}px ${48 * u}px`, borderRadius: theme.radius * 1.4 * u,
			background: after ? `linear-gradient(160deg, ${alpha(theme.color.accent, 14)}, ${theme.color.surface} 55%)` : alpha(theme.color.surface, 70),
			border: `${after ? 2 : 1}px solid ${after ? alpha(theme.color.accent, 60) : alpha(theme.color.text, 10)}`,
			display: 'flex', flexDirection: 'column', gap: 28 * u, minHeight: 0,
			clipPath: after ? (vertical ? `inset(0 0 ${100 - 100 * wipe}% 0)` : `inset(0 ${100 - 100 * wipe}% 0 0)`) : undefined,
			opacity: after ? 1 : 1 - 0.35 * wipe,
		}}>
			<div><Tag accent={after}>{label}</Tag></div>
			<div style={{
				fontSize: (text.length > 90 ? 38 : 48) * u, lineHeight: 1.3, textWrap: 'pretty',
				...(after ? displayFace(theme) : { fontFamily: fontStack(theme).body }), fontWeight: after ? 700 : 400,
				color: after ? theme.color.text : theme.color.muted,
				textDecoration: after ? 'none' : `line-through ${alpha(theme.color.muted, 45 * wipe)}`,
			}}>{text}</div>
		</div>
	);

	return (
		<SceneShell {...p}>
			<Heading title={scene.title} subtitle={scene.subtitle} align={vertical ? 'left' : 'center'} />
			<div style={{
				display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 40 * u, alignItems: 'stretch',
				opacity: enter, transform: `translateY(${(1 - enter) * 30 * u}px)`,
			}}>
				{card('Before', scene.before ?? '', false)}
				{card('After', scene.after ?? '', true)}
			</div>
		</SceneShell>
	);
};

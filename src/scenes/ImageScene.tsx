// Image: full-bleed Ken Burns with a lower-third title, or (with `url`) a browser window screenshot.
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { assetSrc } from '../calculate-metadata.ts';
import { sceneFrames } from '../lib/timing.ts';
import { displayFace, fontStack, isLight, useEnter, useLayout, useTheme } from '../theme/theme.tsx';
import { Heading, KenBurnsImg, SceneShell, WindowFrame, alpha, usable, type SceneProps } from './ui.tsx';

const Placeholder = ({ label }: { label: string }) => {
	const theme = useTheme();
	const { u } = useLayout();
	return (
		<AbsoluteFill style={{
			background: `radial-gradient(circle at 30% 30%, ${alpha(theme.color.accent, 22)}, transparent 60%), radial-gradient(circle at 75% 70%, ${alpha(theme.color.accent2, 22)}, transparent 55%), ${theme.color.surface}`,
			justifyContent: 'center', alignItems: 'center', color: theme.color.muted, fontFamily: fontStack(theme).mono, fontSize: 24 * u,
		}}>{label}</AbsoluteFill>
	);
};

export const ImageScene = (p: SceneProps) => {
	const { scene, props } = p;
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const u = layout.u;
	const frames = sceneFrames(scene, fps);
	const enter = useEnter(0);
	const cap = useEnter(12);
	const light = isLight(theme);
	const scrim = light ? '#0B0B0C' : theme.color.bg;
	const img = usable(props, scene.image) ? assetSrc(scene.image) : null;
	const media = img ? <KenBurnsImg src={img} frames={frames} /> : <Placeholder label={scene.image ? `missing: ${scene.image}` : ''} />;

	if (scene.url) {
		return (
			<SceneShell {...p} center={false}>
				<Heading title={scene.title} subtitle={scene.subtitle} size={0.8} />
				<div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start' }}>
					<WindowFrame
						style={{ width: '100%', height: '100%', opacity: enter, transform: `translateY(${(1 - enter) * 50 * u}px) scale(${0.97 + 0.03 * enter})` }}
						bar={
							<div style={{
								marginLeft: 20 * u, flex: 1, maxWidth: 760 * u, height: 34 * u, borderRadius: 17 * u, background: alpha(theme.color.text, 7),
								display: 'flex', alignItems: 'center', padding: `0 ${18 * u}px`, fontSize: 20 * u, color: theme.color.muted,
								fontFamily: fontStack(theme).mono, whiteSpace: 'nowrap', overflow: 'hidden',
							}}>{scene.url}</div>
						}
					>
						<div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>{media}</div>
					</WindowFrame>
				</div>
			</SceneShell>
		);
	}

	return (
		<SceneShell {...p} glow={false} center={false}>
			<AbsoluteFill style={{ opacity: enter }}>
				{media}
				{/* Photos keep a dark scrim even on light themes: a paper-white fade over an image looks washed out. */}
				<AbsoluteFill style={{ background: `linear-gradient(180deg, transparent 40%, ${alpha(scrim, 55)} 70%, ${alpha(scrim, 92)} 100%)` }} />
			</AbsoluteFill>
			{(scene.title || scene.subtitle) && (
				<div style={{ marginTop: 'auto', position: 'relative', color: light ? '#FFFFFF' : theme.color.text, opacity: cap, transform: `translateY(${(1 - cap) * 24 * u}px)` }}>
					<div style={{ width: 56 * u, height: 4 * u, background: theme.color.accent, marginBottom: 20 * u }} />
					{scene.title && <div style={{ ...displayFace(theme), fontWeight: 700, fontSize: 64 * u, lineHeight: 1.08, textWrap: 'balance', textShadow: `0 2px 24px ${alpha('#000000', 50)}` }}>{scene.title}</div>}
					{scene.subtitle && <div style={{ marginTop: 12 * u, fontSize: 30 * u, color: light ? alpha('#FFFFFF', 75) : theme.color.muted }}>{scene.subtitle}</div>}
				</div>
			)}
		</SceneShell>
	);
};

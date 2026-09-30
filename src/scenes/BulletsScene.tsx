// Bullets: numbered items slide in one by one (20-30 frames apart), accent index markers.
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { sceneFrames } from '../lib/timing.ts';
import { fontStack, useLayout, useTheme } from '../theme/theme.tsx';
import { Heading, SceneShell, alpha, type SceneProps } from './ui.tsx';

export const BulletsScene = (p: SceneProps) => {
	const { scene } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const u = layout.u;
	const bullets = (scene.bullets ?? []).filter((b) => typeof b === 'string' && b.trim()).slice(0, 6);
	const first = 14;
	const gap = Math.max(8, Math.min(28, Math.floor((sceneFrames(scene, fps) * 0.6 - first) / Math.max(1, bullets.length))));
	const longest = Math.max(10, ...bullets.map((b) => b.length));
	const fs = Math.max(30 * u, Math.min((layout.portrait ? 48 : 46) * u, (layout.inner.width * (layout.portrait ? 2.6 : 1.7)) / (longest * 0.55)));

	return (
		<SceneShell {...p}>
			<Heading title={scene.title} subtitle={scene.subtitle} />
			<div style={{ display: 'flex', flexDirection: 'column', gap: (bullets.length > 4 ? 26 : 38) * u }}>
				{bullets.map((b, i) => {
					const s = spring({ frame: frame - first - i * gap, fps, config: theme.motion.spring });
					const q = theme.motion.steps > 0 ? Math.floor(s * theme.motion.steps) / theme.motion.steps : s;
					return (
						<div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 28 * u, opacity: q, transform: `translateX(${(1 - q) * -32 * u}px)`, filter: q < 1 ? `blur(${(1 - q) * 6}px)` : undefined }}>
							<span style={{
								fontFamily: fontStack(theme).mono, fontSize: fs * 0.52, color: theme.color.accent, letterSpacing: '0.08em',
								minWidth: '2.4ch', flexShrink: 0, fontWeight: 700,
							}}>{String(i + 1).padStart(2, '0')}</span>
							<span style={{ fontSize: fs, lineHeight: 1.3, textWrap: 'pretty', flex: 1, paddingBottom: 18 * u, borderBottom: `1px solid ${alpha(theme.color.text, 9 * q)}` }}>{b}</span>
						</div>
					);
				})}
			</div>
		</SceneShell>
	);
};

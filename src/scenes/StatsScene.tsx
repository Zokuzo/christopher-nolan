// Stats: up to 4 counters ease out to their value, staggered, each landing on a ding (see cues.ts).
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { STATS } from '../lib/cues.ts';
import { displayFace, displayCharW, useLayout, useTheme } from '../theme/theme.tsx';
import { Heading, SceneShell, alpha, type SceneProps } from './ui.tsx';

export const StatsScene = (p: SceneProps) => {
	const { scene } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const u = layout.u;
	const stats = (scene.stats ?? []).filter((s) => s && typeof s.value === 'number').slice(0, 4);
	const vertical = layout.portrait;
	const texts = stats.map((s) => `${s.prefix ?? ''}${new Intl.NumberFormat('en-US').format(s.value)}${s.suffix ?? ''}`);
	const longest = Math.max(3, ...texts.map((t) => t.length));
	const colW = vertical ? layout.inner.width : layout.inner.width / Math.max(1, stats.length);
	const numSize = Math.min((vertical ? 150 : stats.length > 3 ? 120 : 150) * u, (colW * 0.86) / (longest * Math.max(0.62, displayCharW(theme))));

	return (
		<SceneShell {...p}>
			<Heading title={scene.title} subtitle={scene.subtitle} align={vertical ? 'left' : 'center'} />
			<div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: (vertical ? 56 : 0) * u, alignItems: 'stretch' }}>
				{stats.map((s, i) => {
					const start = STATS.start + i * STATS.stagger;
					const t = interpolate(frame, [start, start + STATS.count], [0, 1], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
					const decimals = Math.min(3, (String(s.value).split('.')[1] ?? '').length);
					const value = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(s.value * t);
					const inS = spring({ frame: frame - start, fps, config: theme.motion.spring });
					const land = spring({ frame: frame - start - STATS.count, fps, config: { damping: 12, stiffness: 200, mass: 0.6 } });
					return (
						<div key={i} style={{
							flex: 1, padding: vertical ? 0 : `0 ${32 * u}px`, textAlign: vertical ? 'left' : 'center',
							borderLeft: !vertical && i > 0 ? `1px solid ${alpha(theme.color.text, 12)}` : 'none',
							opacity: inS, transform: `translateY(${(1 - inS) * 40 * u}px)`,
						}}>
							<div style={{
								...displayFace(theme), fontWeight: 700, fontSize: numSize, lineHeight: 1,
								fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', whiteSpace: 'nowrap',
								color: theme.color.text, transform: `scale(${1 + 0.06 * land * (1 - land) * 4})`,
								transformOrigin: vertical ? 'left center' : 'center',
							}}>
								<span style={{ color: theme.color.accent }}>{s.prefix ?? ''}</span>{value}<span style={{ color: theme.color.accent }}>{s.suffix ?? ''}</span>
							</div>
							<div style={{
								height: 3 * u, width: `${40 * t}%`, background: theme.color.accent, margin: vertical ? `${22 * u}px 0` : `${22 * u}px auto`,
								borderRadius: 2,
							}} />
							<div style={{ fontSize: 28 * u, color: theme.color.muted, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1.35 }}>{s.label}</div>
						</div>
					);
				})}
			</div>
		</SceneShell>
	);
};

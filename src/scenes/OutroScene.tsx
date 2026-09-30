// Outro: title + CTA + URL pill, and scrolling credits generated from assets.lock.json (_credits).
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Credit } from '../calculate-metadata.ts';
import { sceneFrames } from '../lib/timing.ts';
import { displayFace, displayCharW, fitSize, fontStack, useEnter, useLayout, useTheme } from '../theme/theme.tsx';
import { SceneShell, alpha, type SceneProps } from './ui.tsx';

const KIND: Record<string, string> = { music: 'Music', sfx: 'Sound', voice: 'Voice', image: 'Image' };

export const OutroScene = (p: SceneProps) => {
	const { scene, props } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const u = layout.u;
	const frames = sceneFrames(scene, fps);
	const credits = ((props._credits ?? []) as Credit[]).filter((c) => c && (c.title || c.attribution));
	const hasCredits = credits.length > 0;
	// Credits sit beside the title only on 16:9; 1:1 and 9:16 stack them underneath (a side column is too narrow there).
	const side = hasCredits && !layout.portrait && !layout.square;

	const left = side || layout.portrait || hasCredits; // credits stacked below read best under a left-aligned title
	const title = scene.title || props.title || '';
	const t = useEnter(0);
	const c = useEnter(10 + theme.motion.stagger);
	const l = useEnter(20 + theme.motion.stagger * 2);
	const titleW = side ? layout.inner.width * 0.52 : layout.inner.width;
	const titleSize = fitSize(title, titleW, (layout.portrait ? 110 : 120) * u, 48 * u, displayCharW(theme), 2);

	// Credits wrap (never ellipsis-truncate a license or attribution); each row's height is estimated
	// from its text length so the scroll distance stays exact. Titles are clamped to 3 lines as a backstop.
	const fs = (layout.portrait ? 23 : 22) * u;
	const boxW = side ? layout.inner.width * 0.45 - 72 * u - 48 * u : layout.inner.width;
	const boxH = side ? layout.inner.height : layout.inner.height * (layout.portrait ? 0.42 : 0.36);
	const lh = 1.35;
	const linesFor = (text: string, size: number) => Math.max(1, Math.ceil((text.length * size * 0.54) / boxW));
	const rows = credits.map((cr) => {
		const head = `${cr.title}${cr.creator ? ` — ${cr.creator}` : ''}`;
		const meta = [cr.license, cr.sourceUrl?.replace(/^https?:\/\//, '')].filter(Boolean).join(' · ');
		const titleLines = Math.min(3, linesFor(head, fs));
		const metaLines = meta ? Math.min(2, linesFor(meta, fs * 0.8)) : 0;
		return { cr, meta, titleLines, metaLines, h: fs * 0.75 * lh + titleLines * fs * lh + metaLines * fs * 0.8 * lh + fs * 1.1 };
	});
	const listH = rows.reduce((a, r) => a + r.h, 0) + fs * 2;
	const scrolls = listH > boxH;
	const y = scrolls
		? interpolate(frame, [fps, frames - fps * 0.5], [boxH * 0.35, boxH - listH], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
		: (boxH - listH) / 2;
	const credOpacity = interpolate(frame, [fps * 0.6, fps * 1.2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

	return (
		<SceneShell {...p}>
			<div style={{ display: 'flex', flexDirection: side ? 'row' : 'column', alignItems: side ? 'center' : 'stretch', gap: 72 * u, height: '100%', justifyContent: 'center' }}>
				<div style={{ flex: side ? '0 0 55%' : '0 0 auto', textAlign: left ? 'left' : 'center' }}>
					<div style={{
						...displayFace(theme), fontWeight: 700, fontSize: titleSize, lineHeight: 1.05, letterSpacing: '-0.01em',
						textWrap: 'balance', opacity: t, transform: `scale(${0.92 + 0.08 * t})`, transformOrigin: left ? 'left center' : 'center',
					}}>{title}</div>
					{(scene.cta || scene.subtitle) && (
						<div style={{ marginTop: 28 * u, fontSize: 40 * u, lineHeight: 1.35, color: theme.color.text, opacity: c * 0.9, transform: `translateY(${(1 - c) * 18 * u}px)`, textWrap: 'balance' }}>
							{scene.cta || scene.subtitle}
						</div>
					)}
					{scene.url && (
						<div style={{
							whiteSpace: 'nowrap', maxWidth: '100%',
							marginTop: 44 * u, display: 'inline-flex', alignItems: 'center', gap: 16 * u, padding: `${16 * u}px ${30 * u}px`,
							borderRadius: 999, border: `2px solid ${theme.color.accent}`, background: alpha(theme.color.accent, 12),
							fontFamily: fontStack(theme).mono, color: theme.color.text,
							fontSize: Math.min(32 * u, (titleW - 110 * u) / ((scene.url.length + 2) * 0.6)),
							opacity: l, transform: `translateY(${(1 - l) * 18 * u}px)`,
							boxShadow: `0 0 ${50 * u * l}px ${alpha(theme.color.accent, 25)}`,
						}}>
							<span style={{ color: theme.color.accent }}>→</span>{scene.url}
						</div>
					)}
				</div>
				{hasCredits && (
					<div style={{
						flex: side ? 1 : '0 0 auto', height: boxH, position: 'relative', overflow: 'hidden', opacity: credOpacity,
						maskImage: scrolls ? 'linear-gradient(180deg, transparent 0%, #000 14%, #000 86%, transparent 100%)' : undefined,
						borderLeft: side ? `1px solid ${alpha(theme.color.text, 10)}` : 'none', paddingLeft: side ? 48 * u : 0,
					}}>
						<div style={{ transform: `translateY(${y}px)` }}>
							<div style={{ height: fs * 2, fontSize: fs * 0.9, letterSpacing: '0.3em', textTransform: 'uppercase', color: theme.color.accent, fontWeight: 700 }}>Credits</div>
							{rows.map(({ cr, meta, titleLines, metaLines, h }, i) => (
								<div key={i} style={{ height: h, overflow: 'hidden', fontSize: fs, lineHeight: lh }}>
									<div style={{ fontSize: fs * 0.75, letterSpacing: '0.2em', textTransform: 'uppercase', color: theme.color.muted }}>{KIND[cr.kind] ?? cr.kind}</div>
									<div style={{ color: theme.color.text, overflowWrap: 'anywhere', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: titleLines, overflow: 'hidden' }}>
										{cr.title}{cr.creator ? <span style={{ color: theme.color.muted }}> — {cr.creator}</span> : null}
									</div>
									{meta && (
										<div style={{ color: theme.color.muted, fontSize: fs * 0.8, overflowWrap: 'anywhere', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: metaLines, overflow: 'hidden' }}>{meta}</div>
									)}
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</SceneShell>
	);
};

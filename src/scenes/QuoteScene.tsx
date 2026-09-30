// Quote: oversized accent quote mark, words come into focus one after another, attribution follows.
import { Fragment } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { sceneFrames } from '../lib/timing.ts';
import { displayFace, fitSize, splitEmphasis, useEnter, useLayout, useTheme } from '../theme/theme.tsx';
import { SceneShell, type SceneProps } from './ui.tsx';

export const QuoteScene = (p: SceneProps) => {
	const { scene } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const u = layout.u;
	const words = splitEmphasis(scene.quote || scene.text || '');
	const plain = words.map((w) => w.word).join(' ');
	const size = fitSize(plain, layout.inner.width * 0.9, 72 * u * (layout.portrait ? 1.05 : 1), 40 * u, 0.5, layout.portrait ? 8 : 4);
	const revealEnd = Math.max(20, Math.min(words.length * 5, sceneFrames(scene, fps) * 0.5));
	const per = revealEnd / Math.max(1, words.length);
	const mark = useEnter(0);
	const author = interpolate(frame, [revealEnd + 20, revealEnd + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

	return (
		<SceneShell {...p}>
			<div style={{ position: 'relative', maxWidth: layout.portrait ? '100%' : 1480 * u, alignSelf: 'center' }}>
				<div style={{
					position: 'absolute', top: -size * 1.6, left: -size * 0.2, fontFamily: 'Georgia, serif', fontSize: size * 4,
					lineHeight: 1, color: theme.color.accent, opacity: 0.28 * mark, transform: `translateY(${(1 - mark) * 30}px)`,
				}}>“</div>
				<div style={{ ...displayFace(theme), fontSize: size, lineHeight: 1.28, textWrap: 'balance', position: 'relative' }}>
					{words.map((w, i) => {
						const t = interpolate(frame, [8 + i * per, 8 + i * per + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
						return (
							<Fragment key={i}>{i > 0 && ' '}<span style={{
								display: 'inline-block', color: w.em ? theme.color.accent : theme.color.text,
								opacity: 0.12 + 0.88 * t, filter: `blur(${(1 - t) * 6}px)`,
							}}>{w.word}</span></Fragment>
						);
					})}
				</div>
				{scene.author && (
					<div style={{
						marginTop: 44 * u, display: 'flex', alignItems: 'center', gap: 20 * u, opacity: author,
						transform: `translateY(${(1 - author) * 12 * u}px)`,
					}}>
						<div style={{ width: 48 * u, height: 2 * u, background: theme.color.accent }} />
						<span style={{ fontSize: 30 * u, color: theme.color.muted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{scene.author}</span>
					</div>
				)}
			</div>
		</SceneShell>
	);
};

// Terminal: prompt typed at ~20 chars/s, output appears in blocks, block cursor, auto-scroll.
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { terminalSchedule } from '../lib/cues.ts';
import { fontStack, luminance, useEnter, useLayout, useTheme } from '../theme/theme.tsx';
import { Heading, SceneShell, WindowFrame, alpha, type SceneProps } from './ui.tsx';

export const TerminalScene = (p: SceneProps) => {
	const { scene } = p;
	const frame = useCurrentFrame();
	const theme = useTheme();
	const layout = useLayout();
	const u = layout.u;
	const enter = useEnter(0);
	const { fps } = useVideoConfig();
	const steps = terminalSchedule(scene, fps);
	// A terminal is always dark: light themes get a neutral dark window with light ink.
	const dark = luminance(theme.color.bg) < 0.4;
	const ink = dark ? theme.color.text : '#ECECEC';

	type Line = { kind: 'cmd' | 'out'; text: string; cursor?: boolean };
	const out: Line[] = [];
	let active = -1;
	steps.forEach((s, i) => {
		if (frame < s.typeStart) return;
		const n = Math.floor(interpolate(frame, [s.typeStart, s.typeEnd], [0, s.cmd.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
		out.push({ kind: 'cmd', text: s.cmd.slice(0, n) });
		active = i;
		if (frame >= s.outStart) {
			const blocks = Math.floor((frame - s.outStart) / s.lineStep) + 1;
			for (const l of s.lines.slice(0, blocks * 2)) out.push({ kind: 'out', text: l });
		}
	});
	const next = steps[active + 1];
	const idle = active === -1 || (frame >= (steps[active]?.outStart ?? 0) && (!next || frame < next.typeStart));
	if (idle) out.push({ kind: 'cmd', text: '', cursor: true });
	else if (out.length) out[out.length - 1].cursor = true;

	const headingH = scene.title ? (scene.subtitle ? 190 : 140) * u : 0;
	const availH = layout.inner.height - headingH - 56 * u - 60 * u;
	const longest = Math.max(30, ...steps.flatMap((s) => [s.cmd.length + 2, ...s.lines.map((l) => l.length)]));
	const fs = Math.max(18 * u, Math.min((layout.portrait ? 36 : 32) * u, (layout.inner.width - 80 * u) / (longest * 0.61)));
	const lineH = fs * 1.5;
	const needed = steps.reduce((n, s) => n + 1 + s.lines.length, 1);
	const visible = Math.max(3, Math.min(Math.max(6, needed), Math.floor(availH / lineH)));
	const shown = out.slice(-visible);
	const blinkOn = Math.floor(frame / 8) % 2 === 0;

	return (
		<SceneShell {...p}>
			<Heading title={scene.title} subtitle={scene.subtitle} size={0.8} />
			<div style={{ minHeight: 0, display: 'flex' }}>
				<WindowFrame
					title={scene.filename || 'zsh'}
					bg={dark ? `color-mix(in srgb, ${theme.color.bg} 70%, #000000)` : '#101114'}
					style={{ width: '100%', opacity: enter, transform: `translateY(${(1 - enter) * 48 * u}px) scale(${0.98 + 0.02 * enter})` }}
				>
					<div style={{
						height: visible * lineH + 48 * u, padding: `${24 * u}px ${32 * u}px`, fontFamily: fontStack(theme).mono,
						fontSize: fs, lineHeight: `${lineH}px`, overflow: 'hidden',
					}}>
						{shown.map((l, i) => (
							<div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: l.kind === 'cmd' ? ink : alpha(ink, 62) }}>
								{l.kind === 'cmd' && <span style={{ color: theme.color.accent, fontWeight: 700 }}>$ </span>}
								{l.text}
								{l.cursor && (idle ? blinkOn : true) && (
									<span style={{ display: 'inline-block', width: '0.6em', height: fs * 1.1, verticalAlign: 'text-bottom', background: ink, opacity: 0.85 }} />
								)}
							</div>
						))}
					</div>
				</WindowFrame>
			</div>
		</SceneShell>
	);
};

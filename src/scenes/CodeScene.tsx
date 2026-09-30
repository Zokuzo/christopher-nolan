// Code editor: shiki tokens (from calculateMetadata), typed out, then focus moves to highlighted lines.
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { codeTyping } from '../lib/cues.ts';
import { fontStack, useEnter, useLayout, useTheme } from '../theme/theme.tsx';
import { Heading, SceneShell, WindowFrame, alpha, type SceneProps } from './ui.tsx';

// "3-5,8" -> {3,4,5,8} (1-based).
export const parseLines = (spec?: string): Set<number> => {
	const out = new Set<number>();
	for (const part of (spec ?? '').split(',')) {
		const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
		if (!m) continue;
		const a = Number(m[1]);
		const b = Math.min(a + 500, Number(m[2] ?? m[1]));
		for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
	}
	return out;
};

export const CodeScene = (p: SceneProps) => {
	const { scene, props } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const enter = useEnter(0);

	const code = (scene.code ?? '').replace(/\t/g, '  ').replace(/\s+$/, '');
	const tok = props._tokens?.[scene.id];
	const lines: [string, string, number][][] = tok?.lines?.length
		? tok.lines
		: code.split('\n').map((l) => [[l, theme.color.text, 0]]);
	const fg = tok?.fg ?? theme.color.text;
	const panelBg = tok?.bg ?? theme.color.surface;
	const lens = lines.map((l) => l.reduce((s, t) => s + t[0].length, 0));
	const total = lens.reduce((s, n) => s + n + 1, 0);

	const t = codeTyping(scene, fps);
	const typed = t.end > t.start ? Math.floor(interpolate(frame, [t.start, t.end], [0, total], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })) : total;
	const typing = typed < total;

	const hl = parseLines(scene.highlight);
	const focus = hl.size ? spring({ frame: frame - t.end - 8, fps, config: { damping: 200, stiffness: 90, mass: 1 } }) : 0;

	// Sizing: fit lines vertically and the longest line horizontally.
	const headingH = scene.title ? (scene.subtitle ? 190 : 140) * layout.u : 0;
	const chromeH = 56 * layout.u;
	const availH = layout.inner.height - headingH - chromeH - 64 * layout.u;
	const maxLen = Math.max(20, ...lens);
	const gutterCh = String(lines.length).length + 2;
	const availW = layout.inner.width - 80 * layout.u;
	// 9:16 keeps a readable size and soft-wraps long lines instead of shrinking them.
	const wrap = layout.portrait;
	// On 9:16 the width no longer caps the size (lines wrap); aim for ~1.4 wrapped rows per line.
	const fs = wrap
		? Math.max(24 * layout.u, Math.min(34 * layout.u, availH / (lines.length * 1.55 * 1.4)))
		: Math.max(16 * layout.u, Math.min(34 * layout.u, availH / (lines.length * 1.55), availW / ((maxLen + gutterCh) * 0.61)));
	const lineH = fs * 1.55;
	const cpl = Math.max(10, Math.floor(availW / (fs * 0.61)) - gutterCh);
	const rows = lens.map((n) => (wrap ? Math.max(1, Math.ceil(n / (cpl * 0.85))) : 1)); // 0.85: word wrap leaves ragged line ends
	const rowStart = rows.map((_, i) => rows.slice(0, i).reduce((a, b) => a + b, 0));
	const totalRows = rows.reduce((a, b) => a + b, 0);
	const visible = Math.max(1, Math.floor(availH / lineH));

	// Caret position + scroll (only when the code is taller than the panel).
	let remaining = typed;
	let caretLine = 0;
	for (let i = 0; i < lines.length; i++) {
		if (remaining <= lens[i]) { caretLine = i; break; }
		remaining -= lens[i] + 1;
		caretLine = i + 1;
	}
	const firstHl = hl.size ? Math.min(...hl) - 1 : 0;
	const overflow = Math.max(0, totalRows - visible);
	const caretRow = (rowStart[caretLine] ?? totalRows) + (rows[caretLine] ?? 0);
	const scrollTyping = Math.min(overflow, Math.max(0, caretRow - visible + 2));
	const scrollFocus = Math.min(overflow, Math.max(0, (rowStart[firstHl] ?? 0) - 2));
	const scroll = typing ? scrollTyping : interpolate(focus, [0, 1], [scrollTyping, hl.size ? scrollFocus : scrollTyping]);

	const blink = typing || Math.floor(frame / 8) % 2 === 0;
	let budget = typed;

	return (
		<SceneShell {...p}>
			<Heading title={scene.title} subtitle={scene.subtitle} size={0.8} />
			<div style={{ minHeight: 0, display: 'flex' }}>
				<WindowFrame
					title={scene.filename}
					bg={panelBg}
					style={{
						width: '100%', maxHeight: '100%',
						opacity: enter, transform: `translateY(${(1 - enter) * 48 * layout.u}px) scale(${0.98 + enter * 0.02})`,
					}}
				>
					<div style={{ overflow: 'hidden', height: Math.min(totalRows, visible) * lineH + 40 * layout.u, padding: `${20 * layout.u}px 0` }}>
						<div style={{ transform: `translateY(${-scroll * lineH}px)`, fontFamily: fontStack(theme).mono, fontSize: fs, lineHeight: `${lineH}px`, color: fg }}>
							{lines.map((line, i) => {
								const n = i + 1;
								const isHl = hl.has(n);
								const dim = hl.size && !isHl ? 1 - 0.65 * focus : 1;
								let lineBudget = Math.max(0, budget);
								budget -= lens[i] + 1;
								const showCaret = i === caretLine && blink && (typing || frame < t.end + fps * 1.2 || !hl.size);
								return (
									<div key={i} style={{
										display: 'flex', whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowWrap: wrap ? 'anywhere' : 'normal', position: 'relative', opacity: dim,
										background: isHl ? alpha(theme.color.accent, 13 * focus) : 'transparent',
										boxShadow: isHl ? `inset ${4 * layout.u * focus}px 0 0 ${theme.color.accent}` : 'none',
									}}>
										<span style={{ width: `${gutterCh}ch`, flexShrink: 0, textAlign: 'right', paddingRight: '1.2ch', color: isHl && focus > 0.5 ? theme.color.accent : alpha(fg, 32) }}>{n}</span>
										<span style={{ flex: 1, minWidth: 0 }}>
											{line.map(([text, color, style], j) => {
												if (lineBudget <= 0) return null;
												const shown = text.slice(0, lineBudget);
												lineBudget -= text.length;
												return (
													<span key={j} style={{
														color: color || fg,
														fontStyle: style & 1 ? 'italic' : 'normal',
														fontWeight: style & 2 ? 700 : 400,
														textDecoration: style & 4 ? 'underline' : 'none',
													}}>{shown}</span>
												);
											})}
											{showCaret && (
												<span style={{ display: 'inline-block', width: '0.55ch', height: fs * 1.15, verticalAlign: 'text-bottom', background: theme.color.accent, marginLeft: 1 }} />
											)}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				</WindowFrame>
			</div>
		</SceneShell>
	);
};

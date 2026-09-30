// Architecture diagram: nodes pop in on a grid, edges draw themselves, packets travel along them.
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { evolvePath, getLength, getPointAtLength, getTangentAtLength } from '@remotion/paths';
import { displayFace, displayCharW, isLight, fitSize, fontStack, useLayout, useTheme } from '../theme/theme.tsx';
import { Heading, SceneShell, alpha, elevation, type SceneProps } from './ui.tsx';

type Box = { id: string; label: string; x: number; y: number; w: number; h: number };

const edgePath = (a: Box, b: Box): string => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	if (Math.abs(dx) >= Math.abs(dy)) {
		const sx = a.x + Math.sign(dx) * a.w / 2;
		const ex = b.x - Math.sign(dx) * b.w / 2;
		const mx = (sx + ex) / 2;
		return `M ${sx} ${a.y} C ${mx} ${a.y} ${mx} ${b.y} ${ex} ${b.y}`;
	}
	const sy = a.y + Math.sign(dy) * a.h / 2;
	const ey = b.y - Math.sign(dy) * b.h / 2;
	const my = (sy + ey) / 2;
	return `M ${a.x} ${sy} C ${a.x} ${my} ${b.x} ${my} ${b.x} ${ey}`;
};

export const DiagramScene = (p: SceneProps) => {
	const { scene } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const u = layout.u;

	const raw = (scene.nodes ?? []).filter((n) => n && n.id);
	const colsRaw = new Set(raw.map((n) => n.col ?? 0)).size;
	const rowsRaw = new Set(raw.map((n) => n.row ?? 0)).size;
	// Stack wide diagrams vertically on 9:16, and on 1:1 when the gaps between nodes can't hold the edge labels.
	const longestEdgeLabel = Math.max(0, ...(scene.edges ?? []).map((e) => (e?.label ?? '').length));
	const labelW = longestEdgeLabel ? longestEdgeLabel * 22 * u * 0.62 + 40 * u : 40 * u;
	const gapW = (layout.inner.width / Math.max(1, colsRaw)) * 0.42;
	const transpose = colsRaw > rowsRaw && (layout.portrait || gapW < labelW);
	const nodes = raw.map((n) => ({ ...n, c: transpose ? (n.row ?? 0) : (n.col ?? 0), r: transpose ? (n.col ?? 0) : (n.row ?? 0) }));
	const minC = Math.min(0, ...nodes.map((n) => n.c));
	const minR = Math.min(0, ...nodes.map((n) => n.r));
	const cols = Math.max(1, ...nodes.map((n) => n.c - minC + 1));
	const rows = Math.max(1, ...nodes.map((n) => n.r - minR + 1));

	const headingH = scene.title ? (scene.subtitle ? 190 : 150) * u : 0;
	const W = layout.inner.width;
	const cellW = W / cols;
	const cellH = Math.min(Math.max(120, layout.inner.height - headingH) / rows, 300 * u);
	const H = cellH * rows;
	const w = Math.min(cellW * 0.58, 400 * u);
	const h = Math.min(cellH * 0.5, 128 * u);
	const boxes = new Map<string, Box>(nodes.map((n) => [n.id, {
		id: n.id, label: n.label ?? n.id, w, h,
		x: (n.c - minC + 0.5) * cellW, y: (n.r - minR + 0.5) * cellH,
	}]));

	const nodeStep = Math.max(3, theme.motion.stagger + 3);
	const edgesStart = 10 + Math.round(nodes.length * nodeStep * 0.7);
	const edges = (scene.edges ?? []).flatMap((e) => {
		const a = boxes.get(e.from);
		const b = boxes.get(e.to);
		return a && b && a !== b ? [{ ...e, d: edgePath(a, b) }] : [];
	});
	const drawFrames = 20;
	const flowStart = edgesStart + edges.length * 6 + drawFrames;
	const labelSize = fitSize(nodes.reduce((l, n) => ((n.label ?? '').length > l.length ? n.label ?? '' : l), ''), w * 0.82, 38 * u, 16 * u, displayCharW(theme) * 0.95, 2);

	return (
		<SceneShell {...p}>
			<Heading title={scene.title} subtitle={scene.subtitle} size={0.8} />
			<div style={{ position: 'relative', width: W, height: H, flexShrink: 0 }}>
				<svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
					{edges.map((e, i) => {
						const start = edgesStart + i * 6;
						const prog = spring({ frame: frame - start, fps, config: { damping: 200, stiffness: 60, mass: 1 }, durationInFrames: drawFrames });
						const ev = evolvePath(prog, e.d);
						const len = getLength(e.d);
						const end = getPointAtLength(e.d, len) ?? { x: 0, y: 0 };
						const tan = getTangentAtLength(e.d, len) ?? { x: 1, y: 0 };
						const angle = (Math.atan2(tan.y, tan.x) * 180) / Math.PI;
						const period = Math.round(1.6 * fps);
						const t = frame > flowStart ? (((frame - flowStart + i * 11) % period) / period) : -1;
						const pkt = t >= 0 ? getPointAtLength(e.d, t * len) : null;
						const mid = getPointAtLength(e.d, len / 2) ?? end;
						const start0 = getPointAtLength(e.d, 0) ?? end;
						const vertical = Math.abs(end.y - start0.y) > Math.abs(end.x - start0.x);
						return (
							<g key={i}>
								<path d={e.d} fill="none" stroke={alpha(theme.color.text, 14)} strokeWidth={2 * u} />
								<path d={e.d} fill="none" stroke={theme.color.accent} strokeWidth={3 * u} strokeLinecap="round"
									strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
								<polygon points={`0,0 ${-16 * u},${-8 * u} ${-16 * u},${8 * u}`} fill={theme.color.accent}
									transform={`translate(${end.x} ${end.y}) rotate(${angle})`} opacity={prog > 0.92 ? 1 : 0} />
								{pkt && (
									<>
										<circle cx={pkt.x} cy={pkt.y} r={14 * u} fill={alpha(theme.color.accent, 25)} />
										<circle cx={pkt.x} cy={pkt.y} r={6 * u} fill={theme.color.text} />
									</>
								)}
								{e.label && (
									// Vertical edges are short: the label sits beside the line instead of covering it.
									<foreignObject x={vertical ? mid.x + 18 * u : mid.x - 160 * u} y={mid.y - 26 * u} width={320 * u} height={52 * u} opacity={prog}>
										<div style={{ display: 'flex', justifyContent: vertical ? 'flex-start' : 'center', alignItems: 'center', height: '100%' }}>
											<span style={{
												background: theme.color.bg, color: theme.color.muted, fontSize: 22 * u, fontFamily: fontStack(theme).mono,
												padding: `${4 * u}px ${12 * u}px`, borderRadius: 6 * u, border: `1px solid ${alpha(theme.color.text, 12)}`, whiteSpace: 'nowrap',
											}}>{e.label}</span>
										</div>
									</foreignObject>
								)}
							</g>
						);
					})}
				</svg>
				{[...boxes.values()].map((b, i) => {
					const s = spring({ frame: frame - 10 - i * nodeStep, fps, config: { damping: 14, stiffness: 170, mass: 1 } });
					const settle = Math.min(1, s);
					return (
						<div key={b.id} style={{
							position: 'absolute', left: b.x - b.w / 2, top: b.y - b.h / 2, width: b.w, height: b.h,
							display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
							background: `linear-gradient(180deg, ${alpha(theme.color.text, 7)}, ${alpha(theme.color.text, 2)}), ${theme.color.surface}`,
							border: `${2 * u}px solid ${alpha(theme.color.accent, 55)}`, borderRadius: theme.radius * 1.4 * u,
							boxShadow: isLight(theme) ? elevation(theme, u, 0.5) : `0 ${18 * u}px ${50 * u}px ${alpha('#000000', 35)}, 0 0 ${40 * u}px ${alpha(theme.color.accent, 12)}`,
							...displayFace(theme), fontWeight: 700, fontSize: labelSize, lineHeight: 1.15, padding: `0 ${16 * u}px`,
							opacity: settle, transform: `scale(${0.85 + 0.15 * s})`,
						}}>{b.label}</div>
					);
				})}
			</div>
		</SceneShell>
	);
};

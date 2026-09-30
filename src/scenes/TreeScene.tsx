// File tree: nodes revealed depth-first, folders open (chevron turns), focused path lit in accent.
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { fontStack, useEnter, useLayout, useTheme } from '../theme/theme.tsx';
import { Heading, SceneShell, alpha, type SceneProps } from './ui.tsx';

type Row = { path: string; name: string; depth: number; dir: boolean };
type Node = { children: Map<string, Node>; dir: boolean };

const MAX_ROWS = 25;

export const buildTree = (paths: string[]): Row[] => {
	const root: Node = { children: new Map(), dir: true };
	for (const raw of paths) {
		const clean = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '');
		if (!clean) continue;
		const parts = clean.split('/').filter(Boolean);
		let node = root;
		parts.forEach((part, i) => {
			const dir = i < parts.length - 1 || clean.endsWith('/');
			if (!node.children.has(part)) node.children.set(part, { children: new Map(), dir });
			node = node.children.get(part)!;
			if (dir) node.dir = true;
		});
	}
	const rows: Row[] = [];
	const walk = (node: Node, prefix: string, depth: number) => {
		const entries = [...node.children.entries()].sort(([a, x], [b, y]) => Number(y.dir) - Number(x.dir) || a.localeCompare(b));
		for (const [name, child] of entries) {
			const path = prefix + name;
			rows.push({ path, name, depth, dir: child.dir });
			walk(child, path + '/', depth + 1);
		}
	};
	walk(root, '', 0);
	return rows;
};

const Chevron = ({ open, color, size }: { open: number; color: string; size: number }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${-90 + 90 * open}deg)`, flexShrink: 0 }}>
		<path d="M6 9l6 6 6-6" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
	</svg>
);

const Icon = ({ dir, color, size }: { dir: boolean; color: string; size: number }) => (
	<svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
		{dir
			? <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill={alpha(color, 22)} stroke={color} strokeWidth={1.6} />
			: <path d="M6 3h8l5 5v12.5a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5v-17a.5.5 0 0 1 .5-.5zM14 3v5h5" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />}
	</svg>
);

export const TreeScene = (p: SceneProps) => {
	const { scene } = p;
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const theme = useTheme();
	const layout = useLayout();
	const panel = useEnter(4);
	const all = buildTree(scene.tree ?? []);
	const rows = all.slice(0, MAX_ROWS);
	const hidden = all.length - rows.length;
	const focus = (scene.focus ?? '').trim().replace(/\\/g, '/').replace(/\/$/, '');
	const onPath = (path: string) => !!focus && (focus === path || focus.startsWith(path + '/'));

	const side = !layout.portrait && !!(scene.title || scene.subtitle);
	const availH = layout.inner.height - (side ? 0 : scene.title ? 180 * layout.u : 0) - 80 * layout.u;
	const n = rows.length + (hidden > 0 ? 1 : 0);
	const fs = Math.max(18 * layout.u, Math.min((layout.portrait ? 38 : 34) * layout.u, availH / (Math.max(1, n) * 1.7)));
	const rowH = fs * 1.7;
	const step = Math.max(2, theme.motion.stagger - 2);

	return (
		<SceneShell {...p}>
			<div style={{ display: 'flex', flexDirection: side ? 'row' : 'column', alignItems: side ? 'center' : 'stretch', gap: 80 * layout.u, height: '100%', justifyContent: 'center' }}>
				{(scene.title || scene.subtitle) && (
					<div style={{ flex: side ? '0 0 36%' : '0 0 auto' }}>
						<Heading title={scene.title} subtitle={scene.subtitle} />
					</div>
				)}
				<div style={{
					flex: 1, minWidth: 0, background: alpha(theme.color.surface, 80), borderRadius: theme.radius * 1.4 * layout.u,
					border: `1px solid ${alpha(theme.color.text, 10)}`, padding: `${28 * layout.u}px ${36 * layout.u}px`,
					fontFamily: fontStack(theme).mono, fontSize: fs, opacity: panel, transform: `translateY(${(1 - panel) * 30 * layout.u}px)`,
					alignSelf: side ? 'center' : 'stretch',
				}}>
					{rows.map((row, i) => {
						const s = spring({ frame: frame - 8 - i * step, fps, config: theme.motion.spring });
						const lit = onPath(row.path);
						const isFocus = focus === row.path;
						const color = lit ? theme.color.accent : row.dir ? theme.color.text : theme.color.muted;
						const litAt = 8 + rows.length * step + 6;
						const glow = isFocus ? spring({ frame: frame - litAt, fps, config: { damping: 200, stiffness: 100, mass: 1 } }) : 0;
						return (
							<div key={row.path} style={{
								height: rowH, display: 'flex', alignItems: 'center', gap: fs * 0.45,
								paddingLeft: row.depth * fs * 1.4, opacity: s, transform: `translateX(${(1 - s) * -24 * layout.u}px)`,
								color, fontWeight: lit ? 700 : 400, position: 'relative', whiteSpace: 'nowrap',
							}}>
								{isFocus && (
									<div style={{
										position: 'absolute', left: -16 * layout.u, right: -16 * layout.u, top: 2, bottom: 2,
										background: alpha(theme.color.accent, 14 * glow), borderRadius: 6 * layout.u,
										boxShadow: `inset ${3 * layout.u * glow}px 0 0 ${theme.color.accent}`,
									}} />
								)}
								{row.dir ? <Chevron open={s} color={color} size={fs * 0.8} /> : <span style={{ width: fs * 0.8, flexShrink: 0 }} />}
								<Icon dir={row.dir} color={color} size={fs * 0.95} />
								<span style={{ position: 'relative' }}>{row.name}</span>
							</div>
						);
					})}
					{hidden > 0 && (
						<div style={{ height: rowH, display: 'flex', alignItems: 'center', color: theme.color.muted, opacity: spring({ frame: frame - 8 - rows.length * step, fps }) }}>
							… {hidden} more
						</div>
					)}
				</div>
			</div>
		</SceneShell>
	);
};

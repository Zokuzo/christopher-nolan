export type Flags = Record<string, string | boolean>;

// `--k v`, `--k=v`, `--bool`, `--` ends flags. Names listed in `booleans` never consume a value.
export const parseArgs = (argv: string[], booleans: string[] = []): { _: string[]; flags: Flags } => {
	const bools = new Set(['json', 'help', ...booleans]);
	const _: string[] = [];
	const flags: Flags = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--') { _.push(...argv.slice(i + 1)); break; }
		if (!a.startsWith('--') || a.length === 2) { _.push(a); continue; }
		const eq = a.indexOf('=');
		if (eq > 0) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
		const name = a.slice(2);
		const next = argv[i + 1];
		if (bools.has(name) || next === undefined || next.startsWith('--')) flags[name] = true;
		else { flags[name] = next; i++; }
	}
	return { _, flags };
};

// String value of a flag (undefined when absent or given as a bare boolean).
export const str = (flags: Flags, name: string): string | undefined =>
	typeof flags[name] === 'string' ? (flags[name] as string) : undefined;

export const num = (flags: Flags, name: string): number | undefined => {
	const v = str(flags, name);
	if (v === undefined) return undefined;
	const n = Number(v);
	if (!Number.isFinite(n)) throw new Error(`--${name} expects a number, got "${v}"`);
	return n;
};

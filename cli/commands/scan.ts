// `nolan scan <slug> [PATH]`: repo facts the agent reads instead of asking the user.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from '../lib/args.ts';
import { fail, info, json, next, ok } from '../lib/log.ts';
import { assertSlug, projectDir } from '../lib/paths.ts';
import { readState, setStage, writeState } from '../lib/state.ts';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'vendor', 'out', 'target', 'coverage', '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.cache', '.turbo']);
const MAX_FILES = 20000;
// Generated noise that would dominate line counts.
const NOT_SOURCE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|go\.sum|composer\.lock|Gemfile\.lock)$|\.min\.(js|css)$|\.map$/;
const MAX_BYTES = 1_000_000;

export const LANGS: Record<string, string> = {
	'.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
	'.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
	'.py': 'Python', '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin',
	'.swift': 'Swift', '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.c': 'C', '.h': 'C',
	'.cpp': 'C++', '.cc': 'C++', '.hpp': 'C++', '.scala': 'Scala', '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir',
	'.lua': 'Lua', '.zig': 'Zig', '.sh': 'Shell', '.bash': 'Shell', '.ps1': 'PowerShell',
	'.vue': 'Vue', '.svelte': 'Svelte', '.astro': 'Astro', '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS',
	'.sql': 'SQL', '.md': 'Markdown', '.mdx': 'MDX', '.json': 'JSON', '.yml': 'YAML', '.yaml': 'YAML', '.toml': 'TOML',
};
const CODE_EXT = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.py', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.dart', '.lua', '.zig', '.ex', '.exs', '.scala', '.cs', '.java', '.c', '.cpp', '.cc']);
const CONFIG_FILES = new Set(['package.json', 'tsconfig.json', 'deno.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'requirements.txt', 'setup.py', 'Gemfile', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'Dockerfile', 'docker-compose.yml', 'compose.yaml', 'Makefile', 'justfile', 'vite.config.ts', 'next.config.js', 'next.config.ts', 'remotion.config.ts', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md']);
const ENTRY = /^(main|index|app|cli|server|lib|mod|__main__)\.[a-z]+$/;

export type FileStat = { path: string; lines: number };
export type LangStat = { language: string; files: number; lines: number; percent: number };
export type Excerpt = { file: string; line: number; name: string; lines: number; code: string };

export const isBinary = (buf: Buffer): boolean => buf.subarray(0, 8000).includes(0);
export const countLines = (text: string): number => (text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0);

// Lines of code per language (known extensions only), biggest first.
export const languageStats = (files: FileStat[]): LangStat[] => {
	const by = new Map<string, { files: number; lines: number }>();
	for (const f of files) {
		const lang = LANGS[extname(f.path).toLowerCase()];
		if (!lang) continue;
		const s = by.get(lang) ?? { files: 0, lines: 0 };
		s.files++; s.lines += f.lines;
		by.set(lang, s);
	}
	const total = [...by.values()].reduce((a, s) => a + s.lines, 0) || 1;
	return [...by].map(([language, s]) => ({ language, ...s, percent: Math.round((s.lines / total) * 1000) / 10 }))
		.sort((a, b) => b.lines - a.lines);
};

// The scanned repo is untrusted (e.g. a downloaded archive with its .git): command-line config beats its
// .git/config, so settings that run programs (core.fsmonitor) are neutralised on every call.
const SAFE_GIT = ['-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never'];
const git = (dir: string, args: string[]): string | undefined => {
	try { return execFileSync('git', [...SAFE_GIT, '-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }).trim(); }
	catch { return undefined; }
};

const skipped = (rel: string): boolean => rel.split(/[\\/]/).some((part) => SKIP_DIRS.has(part));

// Tracked files for a git repo (respects .gitignore), else a filesystem walk. Relative, forward slashes.
const listFiles = (dir: string): string[] => {
	const tracked = git(dir, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
	if (tracked !== undefined) return tracked.split('\0').filter((f) => f && !skipped(f)).slice(0, MAX_FILES);
	const out: string[] = [];
	const walk = (d: string): void => {
		for (const e of readdirSync(d, { withFileTypes: true })) {
			if (out.length >= MAX_FILES) return;
			if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(join(d, e.name)); }
			else if (e.isFile()) out.push(relative(dir, join(d, e.name)).split(sep).join('/'));
		}
	};
	walk(dir);
	return out;
};

// Function-sized blocks (5..25 lines) worth showing in a code scene.
export const extractExcerpts = (file: string, text: string): Excerpt[] => {
	const lines = text.split('\n');
	const py = extname(file) === '.py';
	const start = py
		? /^(\s*)(?:async\s+)?def\s+(\w+)/
		: /^\s*(?:export\s+)?(?:default\s+)?(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:function\s*\*?\s*(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>|fn\s+(\w+)|func\s+(?:\([^)]*\)\s*)?(\w+)|def\s+(\w+))/;
	const found: Excerpt[] = [];
	for (let i = 0; i < lines.length; i++) {
		const m = start.exec(lines[i]);
		if (!m) continue;
		const name = py ? m[2] : m.slice(1).find(Boolean) ?? '';
		let end = -1;
		if (py) {
			const indent = m[1].length;
			let j = i + 1;
			for (; j < lines.length && j - i <= 25; j++) {
				const l = lines[j];
				if (l.trim() && l.length - l.trimStart().length <= indent) break;
			}
			end = j - 1;
			while (end > i && !lines[end].trim()) end--;
		} else {
			let depth = 0, opened = false;
			for (let j = i; j < lines.length && j - i < 25; j++) {
				for (const c of lines[j].replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, '')) {
					if (c === '{' || c === '(' || c === '[') { depth++; opened = true; }
					else if (c === '}' || c === ')' || c === ']') depth--;
				}
				if (opened && depth <= 0) { end = j; break; }
			}
		}
		const n = end - i + 1;
		if (end < 0 || n < 5 || n > 25) continue;
		found.push({ file, line: i + 1, name, lines: n, code: lines.slice(i, end + 1).join('\n') });
		i = end;
	}
	return found;
};

// Best 3-5 excerpts: medium length, distinct files, src/ and entrypoints first, no tests.
const pickExcerpts = (all: Excerpt[]): Excerpt[] => {
	const score = (e: Excerpt): number =>
		(e.lines >= 8 && e.lines <= 18 ? 3 : 1) + (/^(src|lib|cli|app|pkg|cmd)\//.test(e.file) ? 2 : 0)
		+ (ENTRY.test(basename(e.file)) ? 1 : 0) + (e.name.length >= 5 ? 1 : 0);
	const seen = new Set<string>();
	return all.filter((e) => !/(^|\/)(tests?|__tests__|spec|fixtures?|examples?)\/|\.(test|spec)\./.test(e.file))
		.sort((a, b) => score(b) - score(a))
		.filter((e) => !seen.has(e.file) && seen.add(e.file))
		.slice(0, 5);
};

const readmeParagraph = (dir: string): string | undefined => {
	const f = readdirSync(dir).find((n) => /^readme(\.md|\.markdown|\.txt|\.rst)?$/i.test(n));
	if (!f) return undefined;
	const blocks = readFileSync(join(dir, f), 'utf8').split(/\r?\n\s*\r?\n/);
	const para = blocks.map((b) => b.split(/\r?\n/).filter((l) => !/^\s*(#|!\[|\[!\[|<|---|===|```|\|)/.test(l)).join(' ').trim())
		.find((b) => b.length > 20);
	return para?.slice(0, 500);
};

const dependencies = (dir: string): Record<string, Record<string, string> | string[]> => {
	const deps: Record<string, Record<string, string> | string[]> = {};
	const read = (f: string): string | undefined => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : undefined);
	const pkg = read('package.json');
	if (pkg) try {
		const p = JSON.parse(pkg) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
		if (p.dependencies) deps.npm = p.dependencies;
		if (p.devDependencies) deps.npmDev = p.devDependencies;
	} catch { /* malformed package.json: skip */ }
	const req = read('requirements.txt');
	if (req) deps.pip = req.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('-'));
	const pyproject = read('pyproject.toml');
	const pyDeps = pyproject && /\bdependencies\s*=\s*\[([^\]]*)\]/.exec(pyproject);
	if (pyDeps) deps.python = [...pyDeps[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
	const gomod = read('go.mod');
	if (gomod) deps.go = [...gomod.matchAll(/^\s*(?:require\s+)?([\w.-]+\.[\w./-]+)\s+v[\w.+-]+/gm)].map((m) => m[1]);
	const cargo = read('Cargo.toml');
	const cargoDeps = cargo && /^\[dependencies\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(cargo);
	if (cargoDeps) deps.cargo = [...cargoDeps[1].matchAll(/^([\w-]+)\s*=/gm)].map((m) => m[1]);
	return deps;
};

const gitStats = (dir: string) => {
	if (git(dir, ['rev-parse', '--is-inside-work-tree']) !== 'true') return null;
	const count = Number(git(dir, ['rev-list', '--count', 'HEAD']) ?? 0);
	if (!count) return { commits: 0 };
	const authors = (git(dir, ['shortlog', '-sn', '--no-merges', 'HEAD']) ?? '').split('\n').filter(Boolean)
		.map((l) => { const m = /^\s*(\d+)\s+(.*)$/.exec(l); return { name: m?.[2] ?? l.trim(), commits: Number(m?.[1] ?? 0) }; });
	const roots = (git(dir, ['rev-list', '--max-parents=0', 'HEAD']) ?? '').split('\n').filter(Boolean);
	return {
		commits: count,
		contributors: authors.length,
		topContributors: authors.slice(0, 5),
		firstCommit: roots.length ? git(dir, ['log', '-1', '--format=%aI', roots.at(-1)!]) : undefined,
		lastCommit: git(dir, ['log', '-1', '--format=%aI']),
		branch: git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
		remote: git(dir, ['remote', 'get-url', 'origin'])?.replace(/\/\/[^@/]+@/, '//'), // drop user:token@
		recent: (git(dir, ['log', '-10', '--no-merges', '--format=%s']) ?? '').split('\n').filter(Boolean),
	};
};

type Pkg = { name?: string; description?: string; bin?: unknown; homepage?: string };
const readPkg = (dir: string): Pkg => {
	try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Pkg; } catch { return {}; } // not a node project
};

const MANIFEST = /^(readme(\.\w+)?|package\.json|cargo\.toml|go\.mod|pyproject\.toml|setup\.py|pom\.xml|build\.gradle(\.kts)?|gemfile|composer\.json|deno\.json)$/i;
const hasManifest = (d: string): boolean => { try { return readdirSync(d).some((n) => MANIFEST.test(n)); } catch { return false; } };

// Nearest ancestor with a README or manifest when `dir` has none; stops at the git root.
export const parentProject = (dir: string): string | undefined => {
	if (hasManifest(dir) || existsSync(join(dir, '.git'))) return undefined;
	for (let d = dirname(dir); d !== dirname(d); d = dirname(d)) {
		if (hasManifest(d)) return d;
		if (existsSync(join(d, '.git'))) return undefined;
	}
	return undefined;
};

export const scanRepo = (dir: string) => {
	const paths = listFiles(dir);
	const stats: FileStat[] = [];
	const excerpts: Excerpt[] = [];
	let codeFilesRead = 0;
	for (const p of paths) {
		const abs = join(dir, p);
		let buf: Buffer;
		try {
			if (statSync(abs).size > MAX_BYTES) continue;
			buf = readFileSync(abs);
		} catch { continue; } // deleted/unreadable/symlink loop
		if (isBinary(buf) || NOT_SOURCE.test(p)) continue;
		const text = buf.toString('utf8');
		stats.push({ path: p, lines: countLines(text) });
		if (CODE_EXT.has(extname(p).toLowerCase()) && codeFilesRead++ < 600) excerpts.push(...extractExcerpts(p, text.replace(/\r\n/g, '\n')));
	}
	const depth = (p: string): number => p.split('/').length;
	const sorted = [...paths].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
	const top = new Map<string, number>();
	for (const p of paths) {
		const [head, ...rest] = p.split('/');
		const key = rest.length ? `${head}/` : head;
		top.set(key, (top.get(key) ?? 0) + 1);
	}
	const pkg = readPkg(dir);
	const up = parentProject(dir);
	return {
		name: pkg.name ?? basename(dir),
		description: pkg.description || readmeParagraph(dir) || null,
		homepage: pkg.homepage ?? null,
		path: dir,
		scannedAt: new Date().toISOString(),
		files: paths.length,
		textFiles: stats.length,
		totalLines: stats.reduce((a, s) => a + s.lines, 0),
		languages: languageStats(stats),
		topLevel: [...top].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => (k.endsWith('/') ? `${k} (${n} files)` : k)),
		tree: sorted.slice(0, 200),
		treeTruncated: paths.length > 200,
		keyFiles: paths.filter((p) => CONFIG_FILES.has(basename(p)) && depth(p) <= 2 || ENTRY.test(basename(p)) && depth(p) <= 3 || /^readme/i.test(p) || /^license/i.test(p)).slice(0, 40),
		bin: pkg.bin ?? null,
		dependencies: dependencies(dir),
		git: gitStats(dir),
		excerpts: pickExcerpts(excerpts),
		// PATH is a subfolder without its own README/manifest: the enclosing project's facts.
		parent: up ? { path: up, name: readPkg(up).name ?? basename(up), description: readPkg(up).description || readmeParagraph(up) || null, dependencies: dependencies(up) } : null,
	};
};

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const slug = assertSlug(_[0]);
	const state = readState(slug);
	const target = _[1] ? resolve(_[1]) : state.repo;
	if (!target) fail(`no repo for "${slug}"`, `nolan scan ${slug} <repo-path>   (no repo: nolan stage ${slug} grill)`);
	if (!existsSync(target!) || !statSync(target!).isDirectory()) fail(`${target} is not a directory`, 'pass a local path (clone URLs first: git clone URL /tmp/x)');

	const facts = scanRepo(target!);
	writeFileSync(join(projectDir(slug), 'repo-facts.json'), JSON.stringify(facts, null, 2) + '\n');
	if (state.repo !== target) writeState({ ...state, repo: target });
	if (state.stage === 'brief') setStage({ ...state, repo: target }, 'scan', `scanned ${target}`);
	if (flags.json) return json(facts);

	ok(`projects/${slug}/repo-facts.json (${facts.files} files, ${facts.totalLines} lines)`);
	info(`name: ${facts.name}${facts.description ? ` — ${facts.description.slice(0, 120)}` : ''}`);
	info(`languages: ${facts.languages.slice(0, 4).map((l) => `${l.language} ${l.percent}%`).join(', ') || 'none detected'}`);
	if (facts.git) info(`git: ${facts.git.commits} commits${'contributors' in facts.git ? `, ${facts.git.contributors} contributors, ${facts.git.firstCommit?.slice(0, 10)} → ${facts.git.lastCommit?.slice(0, 10)}` : ''}`);
	else info('git: not a git repository');
	info(`key files: ${facts.keyFiles.slice(0, 8).join(', ') || 'none'}${facts.keyFiles.length > 8 ? ', …' : ''}`);
	if (facts.parent) info(`parent project: ${facts.parent.path} (${facts.parent.name}); its README/manifest are in repo-facts.json "parent"`);
	info(`excerpts: ${facts.excerpts.map((e) => `${e.file}:${e.line} ${e.name}()`).join(', ') || 'none'}`);
	info(facts.keyFiles.length
		? 'todo: read repo-facts.json and the key files yourself; never ask the user for code facts'
		: `todo: no README/manifest found in ${target}; read repo-facts.json${facts.parent ? ' ("parent" too)' : ''} and the entry source files yourself; never ask the user for code facts, and do not read an empty "dependencies" as "zero dependencies"`);
	next(`nolan stage ${slug} grill`);
};

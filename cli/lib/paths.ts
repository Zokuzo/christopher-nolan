import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const PUBLIC_DIR = join(ROOT, 'public');
export const PROJECTS_DIR = join(ROOT, 'projects');
export const CACHE_DIR = join(ROOT, '.cache');
// Run the Remotion CLI as `node <REMOTION_BIN> ...`: no npx/.cmd shims, same on every OS.
export const REMOTION_BIN = join(ROOT, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const assertSlug = (slug: string | undefined): string => {
	if (!slug || !SLUG.test(slug)) throw new Error(`invalid slug "${slug ?? ''}" (use lowercase letters, digits and dashes)`);
	return slug;
};

export const projectDir = (slug: string): string => join(PROJECTS_DIR, assertSlug(slug));
export const publicProjectDir = (slug: string): string => join(PUBLIC_DIR, 'projects', assertSlug(slug));

// ~/.config/christopher-nolan, honouring XDG_CONFIG_HOME, and %APPDATA% on Windows.
export const configDir = (): string => {
	const base = process.env.XDG_CONFIG_HOME
		|| (process.platform === 'win32' && process.env.APPDATA)
		|| join(homedir(), '.config');
	return join(base, 'christopher-nolan');
};

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { configDir } from './paths.ts';

export const CONFIG_DEFAULTS = {
	budgetUsd: 2,
	grillMode: 'sequential' as 'sequential' | 'rounds',
	defaultTheme: 'interstellar',
	studioPort: 3123,
	ttsModel: 'google/gemini-3.8-flash-lite-tts',
	imageModel: 'recraft/recraft-v4.1-flash',
	critiqueModel: 'openai/gpt-5.6-luna',
	musicModel: 'google/lyria-3-clip-preview',
};
export type Config = typeof CONFIG_DEFAULTS;

export const configPath = (): string => join(configDir(), 'config.json');
export const envPath = (): string => join(configDir(), '.env');

export const readConfig = (): Config => {
	const file = configPath();
	const saved = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>) : {};
	return { ...CONFIG_DEFAULTS, ...saved };
};

export const writeConfig = (config: Config): void => {
	mkdirSync(configDir(), { recursive: true });
	writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n');
};

// process.env wins over the config-dir .env file.
export const loadEnv = (): { OPENROUTER_API_KEY?: string } => {
	const file = envPath();
	const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
	const key = process.env.OPENROUTER_API_KEY || fromFile.OPENROUTER_API_KEY;
	return key ? { OPENROUTER_API_KEY: key } : {};
};

// Upsert one KEY=value line in the config-dir .env (mode 600).
export const saveEnvVar = (name: string, value: string): void => {
	mkdirSync(configDir(), { recursive: true });
	const file = envPath();
	const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith(`${name}=`)) : [];
	lines.push(`${name}=${value}`);
	writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
	chmodSync(file, 0o600); // mode above only applies on creation
};

// `nolan config get [key] | set <key> <value> | set-key`: user config and the OpenRouter key.
import { parseArgs } from '../lib/args.ts';
import { CONFIG_DEFAULTS, configPath, envPath, readConfig, saveEnvVar, writeConfig, type Config } from '../lib/config.ts';
import { fail, info, json, next, ok, warn } from '../lib/log.ts';
import { THEME_PRESETS } from '../../src/schema.ts';
import { keyInfo, type HttpError } from '../ai/client.ts';

const KEYS = Object.keys(CONFIG_DEFAULTS) as (keyof Config)[];

// Coerce + validate a CLI string for one config key.
export const coerce = (name: keyof Config, raw: string): Config[keyof Config] => {
	switch (name) {
		case 'budgetUsd': {
			const n = Number(raw);
			if (!Number.isFinite(n) || n < 0) throw new Error(`budgetUsd must be a number >= 0, got "${raw}"`);
			return n;
		}
		case 'studioPort': {
			const n = Number(raw);
			if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`studioPort must be a port number, got "${raw}"`);
			return n;
		}
		case 'grillMode':
			if (raw !== 'sequential' && raw !== 'rounds') throw new Error('grillMode must be "sequential" or "rounds"');
			return raw;
		case 'defaultTheme':
			if (!(THEME_PRESETS as readonly string[]).includes(raw)) throw new Error(`defaultTheme must be one of: ${THEME_PRESETS.join(', ')}`);
			return raw;
		default:
			if (!raw.trim()) throw new Error(`${name} cannot be empty`);
			return raw.trim(); // model ids
	}
};

// Reads a secret without echo on a TTY (raw mode); piped stdin is read whole.
const readSecret = async (prompt: string): Promise<string> => {
	const { stdin, stderr } = process;
	if (!stdin.isTTY) {
		let s = '';
		for await (const chunk of stdin) s += chunk;
		return s.trim();
	}
	stderr.write(prompt);
	stdin.setEncoding('utf8');
	stdin.setRawMode(true);
	stdin.resume();
	return new Promise((resolve) => {
		let s = '';
		const done = (): void => {
			stdin.off('data', onData);
			stdin.setRawMode(false);
			stdin.pause();
			stderr.write('\n');
			resolve(s.replace(/\x1b\[20[01]~/g, '').trim()); // strip bracketed-paste markers
		};
		const onData = (chunk: string): void => {
			for (const ch of chunk) {
				if (ch === '\r' || ch === '\n') return done();
				if (ch === '\u0003') { stdin.setRawMode(false); stderr.write('\n'); process.exit(130); }
				s = ch === '\u007f' || ch === '\b' ? s.slice(0, -1) : s + ch;
			}
		};
		stdin.on('data', onData);
	});
};

const setKey = async (positional: string[]): Promise<void> => {
	if (positional.length) fail('never pass the key as an argument (it would land in shell history)', 'node cli/nolan.ts config set-key   (then paste the key; or pipe it on stdin)');
	const key = await readSecret('OpenRouter API key (input hidden): ');
	if (!key) fail('no key read from stdin', 'node cli/nolan.ts config set-key');
	if (/\s/.test(key)) fail('the key contains whitespace; paste only the key', 'node cli/nolan.ts config set-key');
	if (!key.startsWith('sk-or-')) warn('OpenRouter keys usually start with "sk-or-"');
	try {
		const k = await keyInfo(key);
		info(`key accepted by OpenRouter (limit ${k.limit === null ? 'none: consider setting a credit limit on this key' : `$${k.limit}`})`);
	} catch (e) {
		const status = (e as HttpError).status;
		if (status === 401 || status === 403) fail(`OpenRouter rejected this key (${status}); nothing saved`, 'copy the key again from https://openrouter.ai/keys');
		warn(`could not verify the key online (${(e as Error).message.split('\n')[0]}); saving it anyway`);
	}
	saveEnvVar('OPENROUTER_API_KEY', key);
	ok(`key saved to ${envPath()} (mode 600)`);
	if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== key) warn('OPENROUTER_API_KEY in your environment overrides the saved key');
	next('node cli/nolan.ts ai status');
};

export const run = async (args: string[]): Promise<void> => {
	const { _, flags } = parseArgs(args);
	const [sub, name, value] = _;
	if (sub === 'set-key') return setKey(_.slice(1));
	const isKey = (n?: string): n is keyof Config => KEYS.includes(n as keyof Config);
	if (sub === 'get' || !sub) {
		const config = readConfig();
		if (name && !isKey(name)) fail(`unknown config key "${name}"`, `one of: ${KEYS.join(', ')}`);
		if (name) info(String(config[name as keyof Config]));
		else if (flags.json) json(config);
		else {
			for (const k of KEYS) info(`${k} = ${config[k]}`);
			info(`file: ${configPath()}`);
		}
		return next('node cli/nolan.ts config set <key> <value>');
	}
	if (sub === 'set') {
		if (!isKey(name)) return fail(`unknown config key "${name ?? ''}"`, `one of: ${KEYS.join(', ')}`);
		if (value === undefined) return fail(`missing value for ${name}`, `node cli/nolan.ts config set ${name} <value>`);
		const config = readConfig();
		let v: Config[keyof Config];
		try { v = coerce(name, value); } catch (e) { return fail((e as Error).message, `node cli/nolan.ts config set ${name} <value>`); }
		writeConfig({ ...config, [name]: v });
		ok(`${name} = ${v}`);
		return next(name === 'budgetUsd' ? 'node cli/nolan.ts ai status' : 'node cli/nolan.ts config get');
	}
	fail(`unknown config subcommand "${sub}"`, 'node cli/nolan.ts config get|set <key> <value>|set-key');
};

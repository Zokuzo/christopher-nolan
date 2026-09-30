#!/usr/bin/env node
// Dispatcher: `node cli/nolan.ts <cmd> [...args]` → cli/commands/<file>.ts `run(args, {cmd})`.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export type CommandContext = { cmd: string };
export type CommandModule = { run: (args: string[], ctx: CommandContext) => Promise<void> };

const COMMANDS: Record<string, { file: string; usage: string; desc: string }> = {
	doctor: { file: 'doctor', usage: 'doctor', desc: 'check node, deps, ffmpeg, Chrome, Openverse, OpenRouter key + budget' },
	setup: { file: 'setup', usage: 'setup', desc: 'vendor sfx into public/sfx, install headless Chrome, create config dir' },
	new: { file: 'new', usage: 'new <slug> [--title T] [--repo PATH] [--format 16:9|9:16|1:1]', desc: 'create a project with state, brief template, starter scenario' },
	list: { file: 'status', usage: 'list', desc: 'all projects with stage and next action' },
	status: { file: 'status', usage: 'status [slug] [--json]', desc: 'stage of a project and exactly what to do next' },
	stage: { file: 'stage', usage: 'stage <slug> <stage> [--note N]', desc: 'set the project stage' },
	scan: { file: 'scan', usage: 'scan <slug> [PATH]', desc: 'extract repo facts into repo-facts.json' },
	validate: { file: 'validate', usage: 'validate <slug>', desc: 'validate scenario.json, print timing and warnings' },
	audio: { file: 'audio', usage: 'audio search|music|sfx|all ...', desc: 'find, download and normalize CC music/sfx' },
	studio: { file: 'studio', usage: 'studio <slug> [--port 3123] [--stop]', desc: 'regenerate src/Root.tsx and start Remotion Studio' },
	sync: { file: 'sync', usage: 'sync <slug>', desc: 'pull Studio props edits from src/Root.tsx into scenario.json' },
	snapshot: { file: 'snapshot', usage: 'snapshot <slug> [--note N]', desc: 'save scenario.json as versions/vNNN.json' },
	versions: { file: 'snapshot', usage: 'versions <slug>', desc: 'list scenario versions' },
	restore: { file: 'snapshot', usage: 'restore <slug> <vNNN>', desc: 'restore a version (snapshots current first)' },
	render: { file: 'render', usage: 'render <slug> [--draft] [--out FILE]', desc: 'sync, validate, snapshot, render mp4 + thumbnail' },
	stills: { file: 'stills', usage: 'stills <slug> [--every S] [--frames a,b,c]', desc: 'render PNG frames for visual QA' },
	approve: { file: 'approve', usage: 'approve <slug>', desc: 'mark the latest full render as approved' },
	reopen: { file: 'approve', usage: 'reopen <slug>', desc: 'move an approved project back to scenario' },
	config: { file: 'config', usage: 'config get|set <key> [value] | config set-key', desc: 'user config and OpenRouter key' },
	ai: { file: 'ai', usage: 'ai status|tts|image|critique|music ...', desc: 'optional OpenRouter features under a hard budget' },
};

const help = (): void => {
	const w = Math.max(...Object.values(COMMANDS).map((c) => c.usage.length));
	console.log('usage: node cli/nolan.ts <command> [args]\n');
	for (const c of Object.values(COMMANDS)) console.log(`  ${c.usage.padEnd(w)}  ${c.desc}`);
	console.log('\nnext: node cli/nolan.ts status');
};

const main = async (): Promise<void> => {
	const [cmd, ...args] = process.argv.slice(2);
	if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return help();
	const entry = COMMANDS[cmd];
	if (!entry) {
		console.error(`error: unknown command "${cmd}"\nfix: node cli/nolan.ts help`);
		process.exit(1);
	}
	const file = join(import.meta.dirname, 'commands', `${entry.file}.ts`);
	if (!existsSync(file)) {
		console.error(`error: "${cmd}" is not implemented yet (missing cli/commands/${entry.file}.ts)\nfix: node cli/nolan.ts help`);
		process.exit(1);
	}
	const mod = (await import(pathToFileURL(file).href)) as CommandModule;
	await mod.run(args, { cmd });
};

main().catch((e: unknown) => {
	const err = e as Error & { issues?: unknown };
	console.error(`error: ${err?.message ?? String(e)}`);
	if (process.env.NOLAN_DEBUG) console.error(err?.stack);
	process.exit(1);
});

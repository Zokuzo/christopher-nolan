// Concise, agent-readable output. Every command should end with next().
export const ok = (msg: string): void => console.log(`ok: ${msg}`);
export const info = (msg: string): void => console.log(msg);
export const warn = (msg: string): void => console.error(`warn: ${msg}`);
export const next = (cmd: string): void => console.log(`next: ${cmd}`);
export const json = (data: unknown): void => console.log(JSON.stringify(data, null, 2));

export const fail = (cause: string, fix?: string): never => {
	console.error(`error: ${cause}`);
	if (fix) console.error(`fix: ${fix}`);
	process.exit(1);
};

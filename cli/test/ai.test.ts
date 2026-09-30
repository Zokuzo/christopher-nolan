// End-to-end `nolan ai` against a fake OpenRouter (node:http on a random port, OPENROUTER_BASE_URL override).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ROOT, projectDir, publicProjectDir } from '../lib/paths.ts';
import { saveScenario } from '../lib/scenario.ts';
import { ffmpeg } from '../lib/ffmpeg.ts';
import { readLedger, spentUsd } from '../ai/ledger.ts';
import { detectLanguage, pickVoice } from '../commands/ai.ts';

const exec = promisify(execFile);
const slug = `zz-ai-test-${process.pid}`;
const tmp = mkdtempSync(join(tmpdir(), 'nolan-ai-'));
const ledger = join(tmp, 'christopher-nolan', 'ledger.jsonl');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let mp3: Buffer;
let server: Server;
let base = '';
const calls: { method: string; path: string; body: any }[] = [];
const fake = { fail402: false, limitRemaining: 9.5 as number | null };

const body = async (req: IncomingMessage): Promise<any> => {
	let s = '';
	for await (const c of req) s += c;
	return s ? JSON.parse(s) : undefined;
};

before(async () => {
	// 3 s of silence as mp3 (raw PCM input: works with system or Remotion's bundled ffmpeg).
	writeFileSync(join(tmp, 'x.raw'), Buffer.alloc(24000 * 2 * 3));
	const r = await ffmpeg(['-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', join(tmp, 'x.raw'), '-c:a', 'libmp3lame', join(tmp, 'x.mp3')]);
	assert.equal(r.code, 0, r.stderr);
	mp3 = readFileSync(join(tmp, 'x.mp3'));

	server = createServer(async (req, res) => {
		const url = new URL(req.url!, 'http://x');
		const b = await body(req);
		calls.push({ method: req.method!, path: url.pathname + url.search, body: b });
		const send = (status: number, data: unknown, headers: Record<string, string> = {}) => {
			res.writeHead(status, { 'content-type': 'application/json', ...headers });
			res.end(JSON.stringify(data));
		};
		if (req.headers.authorization !== 'Bearer sk-or-test') return send(401, { error: { message: 'bad key' } });
		if (req.method === 'POST' && fake.fail402) return send(402, { error: { message: 'Insufficient credits' } });
		switch (`${req.method} ${url.pathname}`) {
			case 'GET /key': return send(200, { data: { limit: 10, limit_remaining: fake.limitRemaining, usage: 0.5 } });
			case 'GET /models':
				return send(200, { data: url.searchParams.get('output_modalities') === 'speech'
					? [{ id: 'google/gemini-3.8-flash-lite-tts', pricing: { prompt: '0.0000005', completion: '0.000006' }, supported_voices: ['Charon', 'Kore', 'fr-FR-Soleil:MAI-Voice-2'] }]
					: [
						{ id: 'openai/gpt-5.6-luna', pricing: { prompt: '0.0000002', completion: '0.0000012' } },
						{ id: 'test/pricey', pricing: { prompt: '0.00001', completion: '0.0001' } },
						{ id: 'google/lyria-3-clip-preview', pricing: { prompt: '0', completion: '0' } },
					] });
			case 'POST /audio/speech':
				res.writeHead(200, { 'content-type': 'audio/mpeg', 'x-generation-id': `gen-tts-${calls.length}` });
				return res.end(mp3);
			case 'GET /generation': return send(200, { data: { total_cost: 0.0012 } });
			case 'GET /images/models/recraft/recraft-v4.1-flash/endpoints':
				return send(200, { id: 'recraft/recraft-v4.1-flash', endpoints: [{ supported_parameters: { aspect_ratio: { type: 'enum', values: ['1:1', '16:9', '9:16'] } }, pricing: [{ billable: 'output_image', unit: 'image', cost_usd: 0.007 }] }] });
			case 'POST /images':
				return send(200, { data: [{ b64_json: PNG.toString('base64'), media_type: 'image/png' }], usage: { cost: 0.007 } });
			case 'POST /chat/completions':
				if (b.stream) { // experimental music: SSE with base64 audio in delta
					res.writeHead(200, { 'content-type': 'text/event-stream' });
					const half = Math.floor(mp3.length / 2);
					res.write(`data: ${JSON.stringify({ id: 'gen-m', choices: [{ delta: { audio: { data: mp3.subarray(0, half).toString('base64') } } }] })}\n\n`);
					res.write(`data: ${JSON.stringify({ id: 'gen-m', choices: [{ delta: { audio: { data: mp3.subarray(half).toString('base64') } } }], usage: { cost: 0.04 } })}\n\n`);
					return res.end('data: [DONE]\n\n');
				}
				return send(200, { id: 'gen-chat', usage: { cost: 0.0021 }, choices: [{ message: { content: JSON.stringify({
					summary: 'Solid.', strengths: ['Strong hook'], issues: [{ severity: 'high', sceneId: 'b', problem: 'Too long', why: 'reading time' }],
					edits: [{ op: 'replace', path: '/scenes/1/seconds', value: 4, reason: 'pacing' }],
				}) } }] });
		}
		send(404, { error: { message: `no route ${req.method} ${url.pathname}` } });
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

	saveScenario(slug, {
		slug, title: 'AI test',
		scenes: [
			{ id: 'a', type: 'title', seconds: 1, narration: 'Bienvenue dans la démo, et voici le projet pour vous.' },
			{ id: 'b', type: 'code', seconds: 5 },
			{ id: 'c', type: 'outro', seconds: 8, narration: 'Merci pour votre attention, et à bientôt dans le terminal.' },
		],
	});
});

after(() => {
	server?.close();
	rmSync(projectDir(slug), { recursive: true, force: true });
	rmSync(publicProjectDir(slug), { recursive: true, force: true });
	rmSync(tmp, { recursive: true, force: true });
});

const nolan = async (args: string[], key = 'sk-or-test') => {
	try {
		const r = await exec(process.execPath, ['cli/nolan.ts', ...args], {
			cwd: ROOT, env: { ...process.env, XDG_CONFIG_HOME: tmp, OPENROUTER_BASE_URL: base, OPENROUTER_API_KEY: key },
		});
		return { code: 0, out: r.stdout + r.stderr };
	} catch (e) {
		const err = e as { code: number; stdout: string; stderr: string };
		return { code: err.code, out: err.stdout + err.stderr };
	}
};
const scenario = () => JSON.parse(readFileSync(join(projectDir(slug), 'scenario.json'), 'utf8'));
const lock = () => JSON.parse(readFileSync(join(publicProjectDir(slug), 'assets.lock.json'), 'utf8'));
const posts = (path: string) => calls.filter((c) => c.method === 'POST' && c.path === path).length;

test('language + voice picking', () => {
	assert.equal(detectLanguage('Bienvenue dans la démo, et voici le projet pour vous.'), 'fr');
	assert.equal(detectLanguage('This is the tool you need to ship your video.'), 'en');
	assert.equal(pickVoice(['Charon', 'aura-2-agathe-fr'], 'fr'), 'aura-2-agathe-fr');
	assert.equal(pickVoice(['Zephyr', 'Charon'], 'fr'), 'Charon');
	assert.equal(pickVoice([], 'en'), undefined);
});

test('no key: friendly message, exit 1', async () => {
	const r = await nolan(['ai', 'tts', slug], '');
	assert.equal(r.code, 1);
	assert.match(r.out, /works without a key/);
	assert.match(r.out, /config set-key/);
});

test('tts: voice files, voiceSrc, extended seconds, lock, settled from /generation; rerun skips', async () => {
	const r = await nolan(['ai', 'tts', slug]);
	assert.equal(r.code, 0, r.out);
	assert.match(r.out, /estimate: \$/);
	assert.match(r.out, /remaining: \$/);
	const speech = calls.filter((c) => c.path === '/audio/speech');
	assert.equal(speech.length, 2);
	assert.equal(speech[0].body.voice, 'fr-FR-Soleil:MAI-Voice-2');
	assert.equal(speech[0].body.response_format, 'mp3');
	const s = scenario();
	assert.equal(s.scenes[0].voiceSrc, `projects/${slug}/voice/a.mp3`);
	assert.ok(s.scenes[0].seconds >= 3.5 && s.scenes[0].seconds <= 3.8, `extended: ${s.scenes[0].seconds}`);
	assert.equal(s.scenes[2].seconds, 8); // already long enough
	assert.equal(s.scenes[1].voiceSrc, undefined);
	assert.ok(existsSync(join(publicProjectDir(slug), 'voice', 'c.mp3')));
	assert.deepEqual(lock().map((e: any) => [e.id, e.kind, e.license]), [['voice:a', 'voice', 'generated'], ['voice:c', 'voice', 'generated']]);
	const settled = readLedger(ledger).filter((e) => e.status === 'settled');
	assert.deepEqual(settled.map((e) => e.actualUsd), [0.0012, 0.0012]);

	const again = await nolan(['ai', 'tts', slug]);
	assert.equal(again.code, 0, again.out);
	assert.match(again.out, /up-to-date/);
	assert.equal(posts('/audio/speech'), 2);
});

test('image: png saved, background set, aspect from format, cost settled', async () => {
	const r = await nolan(['ai', 'image', slug, 'a', '--prompt', 'a nebula']);
	assert.equal(r.code, 0, r.out);
	assert.equal(calls.findLast((c) => c.path === '/images')?.body.aspect_ratio, '16:9');
	assert.equal(scenario().scenes[0].background, `projects/${slug}/images/a.png`);
	assert.deepEqual(readFileSync(join(publicProjectDir(slug), 'images', 'a.png')), PNG);
	assert.equal(readLedger(ledger).at(-1)?.actualUsd, 0.007);
	assert.ok(lock().some((e: any) => e.id === 'image:a'));
});

test('critique: dry-run spends nothing, then critique.md with strengths/issues/edits', async () => {
	const n = readLedger(ledger).length;
	const dry = await nolan(['ai', 'critique', slug, '--dry-run']);
	assert.equal(dry.code, 0, dry.out);
	assert.match(dry.out, /dry run/);
	assert.equal(posts('/chat/completions'), 0);
	assert.equal(readLedger(ledger).length, n);

	const r = await nolan(['ai', 'critique', slug]);
	assert.equal(r.code, 0, r.out);
	assert.equal(calls.findLast((c) => c.path === '/chat/completions')?.body.response_format.type, 'json_object');
	const md = readFileSync(join(projectDir(slug), 'critique.md'), 'utf8');
	for (const h of ['## Strengths', 'Strong hook', '## Issues', 'Too long', '## Edits', '/scenes/1/seconds']) assert.ok(md.includes(h), h);
	assert.equal(readLedger(ledger).at(-1)?.actualUsd, 0.0021);
});

test('estimate above $0.25 requires --yes', async () => {
	const r = await nolan(['ai', 'critique', slug, '--model', 'test/pricey']);
	assert.equal(r.code, 1);
	assert.match(r.out, /--yes/);
});

test('unknown model: candidates listed', async () => {
	const r = await nolan(['ai', 'critique', slug, '--model', 'nope/gone']);
	assert.equal(r.code, 1);
	assert.match(r.out, /not found.*\n.*openai\/gpt-5\.6-luna/);
});

test('music (experimental): SSE audio saved and set as music src', async () => {
	const r = await nolan(['ai', 'music', slug]);
	assert.equal(r.code, 0, r.out);
	assert.match(r.out, /EXPERIMENTAL/);
	assert.equal(scenario().audio.music.src, `projects/${slug}/audio/music-ai.mp3`);
	assert.deepEqual(readFileSync(join(publicProjectDir(slug), 'audio', 'music-ai.mp3')), mp3);
});

test('402 is a hard stop: entry voided, spent unchanged', async () => {
	const spent = spentUsd(readLedger(ledger));
	fake.fail402 = true;
	const r = await nolan(['ai', 'image', slug, 'b', '--prompt', 'x']);
	fake.fail402 = false;
	assert.equal(r.code, 1);
	assert.match(r.out, /402.*hard stop/);
	assert.equal(readLedger(ledger).at(-1)?.status, 'void');
	assert.equal(spentUsd(readLedger(ledger)), spent);
});

test('budget refusal: local cap and OpenRouter key limit, nothing called or written', async () => {
	const n = readLedger(ledger).length;
	const chats = posts('/chat/completions');
	assert.equal((await nolan(['config', 'set', 'budgetUsd', '0.01'])).code, 0);
	const r = await nolan(['ai', 'critique', slug]);
	assert.equal(r.code, 1);
	assert.match(r.out, /refused.*budget/);
	assert.match(r.out, /config set budgetUsd/);

	assert.equal((await nolan(['config', 'set', 'budgetUsd', '5'])).code, 0);
	fake.limitRemaining = 0.00001;
	const k = await nolan(['ai', 'critique', slug]);
	fake.limitRemaining = 9.5;
	assert.equal(k.code, 1);
	assert.match(k.out, /OpenRouter key limit/);

	assert.equal(posts('/chat/completions'), chats);
	assert.equal(readLedger(ledger).length, n);
});

test('ai status --json and config set-key via stdin (never printed)', async () => {
	const s = JSON.parse((await nolan(['ai', 'status', '--json'])).out);
	assert.equal(s.keyPresent, true);
	assert.equal(s.keyLimitRemaining, 9.5);
	assert.equal(s.budgetUsd, 5);

	const child = execFile(process.execPath, ['cli/nolan.ts', 'config', 'set-key'], {
		cwd: ROOT, env: { ...process.env, XDG_CONFIG_HOME: tmp, OPENROUTER_BASE_URL: base, OPENROUTER_API_KEY: '' },
	});
	let out = '';
	child.stdout!.on('data', (d) => (out += d));
	child.stderr!.on('data', (d) => (out += d));
	child.stdin!.end('sk-or-test\n');
	const code = await new Promise((r) => child.on('close', r));
	assert.equal(code, 0, out);
	assert.doesNotMatch(out, /sk-or-test/);
	const env = join(tmp, 'christopher-nolan', '.env');
	assert.equal(readFileSync(env, 'utf8'), 'OPENROUTER_API_KEY=sk-or-test\n');
	if (process.platform !== 'win32') assert.equal(statSync(env).mode & 0o777, 0o600);
});

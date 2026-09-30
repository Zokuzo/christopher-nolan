// Animation schedules shared by scenes and the audio mix, plus the SFX cue list.
// Pure TS with type-only imports: the CLI (`audio sfx`) can import sfxCues() to know which names are used.
import type { Scenario, Scene } from '../schema.ts';
import { sceneFrames, sceneTimeline } from './timing.ts';

export const STATS = { start: 10, stagger: 8, count: 45 } as const; // frames

// Typing window of a code scene (frames relative to the scene start).
export const codeTyping = (scene: Scene, fps: number): { start: number; end: number; chars: number } => {
	const chars = (scene.code ?? '').length;
	const start = Math.round(0.45 * fps);
	if (scene.typing === false || chars === 0) return { start, end: start, chars };
	const natural = (chars / 38) * fps; // ~38 chars/s
	return { start, end: start + Math.round(Math.min(natural, sceneFrames(scene, fps) * 0.55)), chars };
};

export type TermStep = { cmd: string; lines: string[]; typeStart: number; typeEnd: number; outStart: number; lineStep: number };

// Terminal: each command typed (~20 chars/s), Enter, output in blocks of 2 lines every 4 frames.
// Compressed proportionally when it would not fit in 85% of the scene.
export const terminalSchedule = (scene: Scene, fps: number): TermStep[] => {
	const cmds = (scene.commands ?? []).filter((c) => c && typeof c.cmd === 'string');
	const start = Math.round(0.45 * fps);
	const parts = cmds.map((c) => {
		const lines = (c.output ?? '').replace(/\s+$/, '').split('\n').filter((l, i, a) => a.length > 1 || l !== '');
		return { cmd: c.cmd, lines, type: Math.max(6, (c.cmd.length / 20) * fps), out: Math.ceil(lines.length / 2) * 4 };
	});
	const total = parts.reduce((s, p) => s + p.type + 6 + p.out + 12, 0);
	const k = Math.min(1, Math.max(0.2, (sceneFrames(scene, fps) * 0.85 - start) / Math.max(1, total)));
	let t = start;
	return parts.map((p) => {
		const typeStart = Math.round(t);
		const typeEnd = Math.round(t + p.type * k);
		const outStart = Math.round(t + (p.type + 6) * k);
		const lineStep = Math.max(1, 4 * k);
		t += (p.type + 6 + p.out + 12) * k;
		return { cmd: p.cmd, lines: p.lines, typeStart, typeEnd, outStart, lineStep };
	});
};

// Frame (relative to the scene start) after which the scene's text is final: typing, terminal output and
// stat count-ups are done. 0 for scenes with no such animation.
export const settleFrame = (scene: Scene, fps: number): number => {
	if (scene.type === 'code') return codeTyping(scene, fps).end;
	if (scene.type === 'terminal') {
		const last = terminalSchedule(scene, fps).at(-1);
		return last ? Math.ceil(last.outStart + Math.ceil(last.lines.length / 2) * last.lineStep) : 0;
	}
	if (scene.type === 'stats') {
		const n = Math.min(4, scene.stats?.length ?? 0);
		return n ? STATS.start + (n - 1) * STATS.stagger + STATS.count : 0;
	}
	return 0;
};

export type Cue = {
	name: string; // key in public/sfx/index.json (or a project sfx-<name> file)
	frame: number; // absolute frame in the video
	volume: number; // relative, multiplied by audio.sfx.volume
	rate?: number; // playbackRate
	frames?: number; // cut the sound after N frames
	rampIn?: boolean; // volume 0 -> 1 across `frames` (risers)
};

const jitter = (n: number) => {
	const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
	return x - Math.floor(x);
};

// Typing clicks: bursts of 4 at >= 3-frame spacing, then a short gap. Never one per character.
const clicks = (from: number, to: number, seed: number): Cue[] => {
	const out: Cue[] = [];
	const spacing = Math.max(3, Math.ceil((to - from) / 40));
	for (let f = from, n = 0; f < to; f += spacing, n++) {
		if (n % 5 === 4) continue;
		const r = jitter(seed + n);
		out.push({ name: 'click', frame: f + Math.round(r * 2 - 1), volume: 0.4, rate: 0.9 + r * 0.2 });
	}
	return out;
};

// Length of public/sfx/riser.mp3 (setup generates 3 s, silence-trimmed to ~2.76 s): the riser peaks on the cut.
export const RISER_SECONDS = 2.75;

// All SFX cues: explicit scene sfx + (when audio.sfx.auto) whooshes, impacts, riser, clicks, dings.
export const sfxCues = (scenario: Scenario): Cue[] => {
	const fps = scenario.fps ?? 30;
	const scenes = scenario.scenes ?? [];
	const tl = sceneTimeline(scenario);
	const cues: Cue[] = [];
	scenes.forEach((scene, i) => {
		for (const s of scene.sfx ?? []) {
			if (s?.name) cues.push({ name: s.name, frame: tl[i].from + Math.round((s.at ?? 0) * fps), volume: s.volume ?? 1 });
		}
	});
	if (scenario.audio?.sfx?.auto !== false) {
		scenes.forEach((scene, i) => {
			const from = tl[i].from;
			if (i < scenes.length - 1) cues.push({ name: 'whoosh', frame: Math.max(0, tl[i + 1].from - 5), volume: 0.8 });
			if (scene.type === 'title' || scene.type === 'outro') cues.push({ name: 'impact', frame: from, volume: 1 });
			if (scene.type === 'code') {
				const t = codeTyping(scene, fps);
				cues.push(...clicks(from + t.start, from + t.end, i * 1000));
			}
			if (scene.type === 'terminal') {
				terminalSchedule(scene, fps).forEach((s, j) => {
					cues.push(...clicks(from + s.typeStart, from + s.typeEnd, i * 1000 + j * 100));
					cues.push({ name: 'click', frame: from + s.typeEnd + 2, volume: 0.7 });
				});
			}
			if (scene.type === 'stats') {
				(scene.stats ?? []).slice(0, 4).forEach((_, j) =>
					cues.push({ name: 'ding', frame: from + STATS.start + j * STATS.stagger + STATS.count, volume: 0.5 }));
			}
		});
		const t = scenes.findIndex((s) => s.type === 'title');
		if (t >= 0 && t < scenes.length - 1) {
			const end = tl[t + 1].from;
			const start = Math.max(0, end - Math.round(RISER_SECONDS * fps));
			if (end - start > 6) cues.push({ name: 'riser', frame: start, frames: end - start, volume: 0.9, rampIn: true });
		}
	}
	const last = tl.length ? tl[tl.length - 1].from + tl[tl.length - 1].frames : 0;
	return cues.filter((c) => c.frame >= 0 && c.frame < last).sort((a, b) => a.frame - b.frame);
};

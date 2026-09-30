// Pure timing math shared by Remotion and the CLI (type-only imports: safe under Node type-stripping).
import type { Format, Scenario, Scene } from '../schema.ts';

export const formatSize = (format: Format): { width: number; height: number } =>
	format === '9:16' ? { width: 1080, height: 1920 }
	: format === '1:1' ? { width: 1080, height: 1080 }
	: { width: 1920, height: 1080 };

export const sceneFrames = (scene: Pick<Scene, 'seconds'>, fps: number): number =>
	Math.max(1, Math.round(scene.seconds * fps));

// Overlap (frames) of the cut AFTER scene `index`; 0 for the last scene or a 'none' cut.
// Clamped so a transition never exceeds either neighbour (TransitionSeries throws otherwise).
export const transitionFrames = (scenario: Scenario, index: number): number => {
	const { scenes } = scenario;
	if (index < 0 || index >= scenes.length - 1) return 0;
	const type = scenes[index].transition ?? scenario.transition?.type ?? 'fade';
	if (type === 'none') return 0;
	const fps = scenario.fps ?? 30;
	const frames = Math.max(0, Math.round(scenario.transition?.frames ?? 20));
	return Math.min(frames, sceneFrames(scenes[index], fps) - 1, sceneFrames(scenes[index + 1], fps) - 1);
};

// Start frame and length of every scene inside the TransitionSeries.
export const sceneTimeline = (scenario: Scenario): { id: string; from: number; frames: number }[] => {
	const fps = scenario.fps ?? 30;
	let from = 0;
	return scenario.scenes.map((scene, i) => {
		const frames = sceneFrames(scene, fps);
		const entry = { id: scene.id, from, frames };
		from += frames - transitionFrames(scenario, i);
		return entry;
	});
};

export const totalFrames = (scenario: Scenario): number => {
	const fps = scenario.fps ?? 30;
	return Math.max(1, scenario.scenes.reduce(
		(sum, scene, i) => sum + sceneFrames(scene, fps) - transitionFrames(scenario, i), 0));
};

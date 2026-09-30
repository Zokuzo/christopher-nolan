// Audio mix: looped music bed (fade in 1s / out 2s, ducked under voice with 8-frame ramps),
// per-scene voice-over, SFX cues (explicit + auto, see lib/cues.ts). Missing files are skipped.
import { interpolate, useVideoConfig } from 'remotion';
import { Audio } from '@remotion/media';
import { assetSrc, type VideoProps } from '../calculate-metadata.ts';
import { sfxCues } from '../lib/cues.ts';
import { sceneTimeline } from '../lib/timing.ts';
import { usable } from '../scenes/ui.tsx';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const RAMP = 8;

export const Mix = ({ props }: { props: VideoProps }) => {
	const { fps, durationInFrames } = useVideoConfig();
	const audio = props.audio;
	const scenes = props.scenes ?? [];
	const tl = sceneTimeline(props);

	const voiceOn = audio?.voice?.enabled !== false;
	const voices = voiceOn
		? scenes.flatMap((s, i) => (usable(props, s.voiceSrc)
			// Voice length ~ scene length - 0.6s (`ai tts` pads scenes that way).
			? [{ id: s.id, src: s.voiceSrc, from: tl[i].from, to: tl[i].from + Math.max(1, tl[i].frames - Math.round(0.6 * fps)) }]
			: []))
		: [];

	const music = audio?.music;
	const musicOn = music?.enabled !== false && usable(props, music?.src);
	const vol = music?.volume ?? 0.5;
	const duckTo = Math.min(vol, music?.duckTo ?? 0.2);
	const musicVolume = (f: number) => {
		const duck = voices.reduce((m, v) => Math.max(m, interpolate(f, [v.from - RAMP, v.from, v.to, v.to + RAMP], [0, 1, 1, 0], clamp)), 0);
		const fade = interpolate(f, [0, fps, durationInFrames - 2 * fps, durationInFrames], [0, 1, 1, 0], clamp);
		return (vol - (vol - duckTo) * duck) * fade;
	};

	const sfxOn = audio?.sfx?.enabled !== false;
	const sfxVol = audio?.sfx?.volume ?? 0.5;
	const cues = sfxOn ? sfxCues(props).filter((c) => props._sfx?.[c.name]) : [];

	return (
		<>
			{musicOn && music?.src && (
				<Audio src={assetSrc(music.src)} loop loopVolumeCurveBehavior="extend" volume={musicVolume} name="music" />
			)}
			{voices.map((v) => (
				<Audio key={v.id} src={assetSrc(v.src)} from={v.from} volume={audio?.voice?.volume ?? 1} name={`voice ${v.id}`} />
			))}
			{cues.map((c, i) => {
				const v = Math.min(1, sfxVol * c.volume);
				return (
					<Audio
						key={`${c.name}-${c.frame}-${i}`}
						src={staticSfx(props, c.name)}
						from={c.frame}
						durationInFrames={c.frames}
						playbackRate={c.rate}
						volume={c.rampIn && c.frames ? (f: number) => v * interpolate(f, [0, c.frames ?? 1], [0.05, 1], clamp) : v}
						name={`sfx ${c.name}`}
					/>
				);
			})}
		</>
	);
};

const staticSfx = (props: VideoProps, name: string) => assetSrc(props._sfx?.[name] ?? '');

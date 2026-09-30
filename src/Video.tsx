// The whole film: theme + fonts, scenes in a TransitionSeries, film texture overlay, audio mix.
import { Fragment, type ComponentType } from 'react';
import { AbsoluteFill, Easing, useCurrentFrame, useVideoConfig } from 'remotion';
import { TransitionSeries, linearTiming, type TransitionPresentation } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { flip } from '@remotion/transitions/flip';
import { dreamyZoom } from '@remotion/transitions/dreamy-zoom';
import { filmBurn } from '@remotion/transitions/film-burn';
import { blurSlide } from '@remotion/transitions/blur-slide';
import type { SceneType, Transition } from './schema.ts';
import type { VideoProps } from './calculate-metadata.ts';
import { sceneFrames, transitionFrames } from './lib/timing.ts';
import { ThemeProvider, resolveTheme, useFonts, type Theme } from './theme/theme.tsx';
import { Mix } from './audio/Mix.tsx';
import type { SceneProps } from './scenes/ui.tsx';
import { TitleScene } from './scenes/TitleScene.tsx';
import { KineticScene } from './scenes/KineticScene.tsx';
import { CodeScene } from './scenes/CodeScene.tsx';
import { TreeScene } from './scenes/TreeScene.tsx';
import { DiagramScene } from './scenes/DiagramScene.tsx';
import { TerminalScene } from './scenes/TerminalScene.tsx';
import { StatsScene } from './scenes/StatsScene.tsx';
import { BulletsScene } from './scenes/BulletsScene.tsx';
import { QuoteScene } from './scenes/QuoteScene.tsx';
import { ImageScene } from './scenes/ImageScene.tsx';
import { CompareScene } from './scenes/CompareScene.tsx';
import { OutroScene } from './scenes/OutroScene.tsx';

const SCENES: Record<SceneType, ComponentType<SceneProps>> = {
	title: TitleScene, kinetic: KineticScene, code: CodeScene, tree: TreeScene, diagram: DiagramScene, terminal: TerminalScene,
	stats: StatsScene, bullets: BulletsScene, quote: QuoteScene, image: ImageScene, compare: CompareScene, outro: OutroScene,
};

const presentation = (type: Transition, i: number): TransitionPresentation<any> => {
	switch (type) {
		case 'slide': return slide({ direction: 'from-right' });
		case 'wipe': return wipe({ direction: i % 2 ? 'from-left' : 'from-right' });
		case 'flip': return flip({ direction: 'from-right' });
		case 'dreamyZoom': return dreamyZoom({});
		case 'filmBurn': return filmBurn({ seed: i + 1 });
		case 'blurSlide': return blurSlide({ direction: 'from-right' });
		default: return fade();
	}
};

// Film grain (tiled SVG turbulence, reseeded every 2 frames), vignette, optional CRT scanlines.
const Texture = ({ theme }: { theme: Theme }) => {
	const frame = useCurrentFrame();
	const { width, height } = useVideoConfig();
	const seed = Math.floor(frame / 2) % 12;
	const grain = Math.max(0, Math.min(1, theme.grain));
	const tile = `url("data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.6 -0.3'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
	)}")`;
	const short = Math.min(width, height);
	return (
		<AbsoluteFill style={{ pointerEvents: 'none' }}>
			{grain > 0 && (
				<AbsoluteFill style={{ backgroundImage: tile, backgroundSize: `${Math.round(short / 4.2)}px`, backgroundPosition: `${(seed * 37) % 256}px ${(seed * 91) % 256}px`, opacity: grain * 0.55, mixBlendMode: 'overlay' }} />
			)}
			{theme.vignette > 0 && (
				<AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 75% at 50% 50%, transparent 55%, rgba(0,0,0,${0.75 * theme.vignette}) 100%)` }} />
			)}
			{theme.scanlines && (
				<AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 2px, transparent 2px, transparent 5px)', mixBlendMode: 'multiply' }} />
			)}
		</AbsoluteFill>
	);
};

export const Video = (props: VideoProps) => {
	const theme = useFonts(resolveTheme(props.theme));
	const fps = props.fps ?? 30;
	const scenes = (props.scenes ?? []).filter(Boolean);
	const scenario = { ...props, scenes };
	const [a, b, c, d] = theme.motion.ease;
	const easing = Easing.bezier(a, b, c, d);

	return (
		<ThemeProvider value={theme}>
			<AbsoluteFill style={{ backgroundColor: theme.color.bg }}>
				<TransitionSeries>
					{scenes.map((scene, i) => {
						const Scene = SCENES[scene.type] ?? KineticScene;
						const overlap = transitionFrames(scenario, i);
						const type = scene.transition ?? props.transition?.type ?? 'fade';
						return (
							<Fragment key={`${scene.id}-${i}`}>
								<TransitionSeries.Sequence durationInFrames={sceneFrames(scene, fps)} name={`${i + 1}. ${scene.type} · ${scene.id}`}>
									<Scene scene={scene} props={props} index={i} />
								</TransitionSeries.Sequence>
								{overlap > 0 && (
									<TransitionSeries.Transition presentation={presentation(type, i)} timing={linearTiming({ durationInFrames: overlap, easing })} />
								)}
							</Fragment>
						);
					})}
				</TransitionSeries>
				<Texture theme={theme} />
				<Mix props={scenario} />
			</AbsoluteFill>
		</ThemeProvider>
	);
};

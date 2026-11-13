import { z } from 'zod';

// How a game looks, sounds (later) and moves. Everything players, the shared
// screen and the host see can be changed per game, and again per scene. These
// are public (never secret) and contain no code: colours, fonts from a fixed
// list, numbers within bounds, and texts. Custom styles or scripts are not
// accepted because they would run on every guest's device.

/** Every text the room screens show, with its default. `{name}` style placeholders are filled in. */
export const TEXT_DEFAULTS = {
  'join.title': 'Join a game', 'join.code': 'Room code', 'join.name': 'Your name', 'join.button': 'Join room', 'join.joining': 'Joining…',
  'join.reclaim': 'Phone died during a game?', 'join.reclaimButton': 'Take over my seat', 'join.notFound': 'No open room has that code. Check the code on the shared screen.',
  'status.waiting': 'waiting to start', 'status.playing': 'playing', 'status.paused': 'paused', 'status.finished': 'finished',
  'lobby.playerTitle': 'You’re in!', 'lobby.playerText': 'Waiting for the host to start. Keep this screen open.',
  'lobby.screenTitle': 'Join on your phone', 'lobby.screenGo': 'Go to {host} and enter',
  'answer.legend': 'Your private answer', 'answer.submit': 'Save answer', 'answer.saved': 'Your answer is in!', 'answer.savedTeam': 'Your team’s answer is in!',
  'vote.legend': 'Your private vote', 'vote.submit': 'Save vote', 'vote.saved': 'Your vote is in!', 'vote.savedTeam': 'Your team’s vote is in!',
  'timer.left': '{time} left', 'timer.up': 'Time is up', 'timer.none': 'No time limit', 'timer.paused': 'Paused · {time} left',
  'wait.screen': 'Watch the shared screen.', 'wait.challenge': 'Follow the host’s instructions.', 'wait.forming': 'Answers open once the host starts the round with these teams.',
  'wait.sitOut': 'You sit this team round out.', 'wait.captain': 'Your captain {captain} answers for {team}.', 'wait.lateVoter': 'You joined after voting opened, so you do not vote on this route.', 'wait.hostRoute': 'The host chooses the route.',
  'progress.answered': '{count} of {total} answered', 'progress.voted': '{count} of {total} voted', 'progress.locked': 'answers are locked',
  'results.title': 'Results', 'results.correct': 'Correct answer: {answer}', 'results.earned': 'You earned {points} points this round.', 'results.nothing': 'No points for you this round.',
  'results.points': 'Points this round', 'results.teamPoints': 'Team points this round', 'results.nobody': 'Nobody scored this round.',
  'scores.title': 'Scoreboard', 'scores.final': 'Final scores', 'scores.note': 'Scores include revealed rounds only.', 'scores.teams': 'Teams',
  'route.goes': 'The party goes: {route}', 'route.closed': 'Voting has closed. The host announces the route.', 'route.hostChoosing': 'The host is choosing the route.',
  'players.title': 'Players · {count}', 'players.changeLook': 'Change my look',
  'phase.teams': 'Picking teams', 'phase.answer': 'Answer now', 'phase.vote': 'Vote now', 'phase.route': 'Choose the route', 'phase.minigame': 'Minigame', 'phase.challenge': 'Challenge',
  'phase.locked': 'Answers are in', 'phase.results': 'Results', 'phase.paused': 'Paused', 'phase.allIn': 'Everyone has answered',
  'scores.open': 'Show the scoreboard', 'scores.close': 'Close', 'react.open': 'Send a reaction', 'react.title': 'React on the big screen',
  'minigame.getReady': 'Get ready…', 'minigame.wait': 'Wait for it…', 'minigame.go': 'GO!', 'minigame.tooSoon': 'Too soon!', 'minigame.tap': 'TAP!',
  'minigame.stop': 'Stop', 'minigame.pickDoor': 'Pick a door', 'minigame.door': 'Door {number}', 'minigame.result': 'Your result: {result}', 'minigame.played': 'Done! Waiting for the others…', 'minigame.paused': 'Paused. When the host continues, you get a new countdown.',
  'minigame.places': 'Places', 'minigame.behindDoors': 'Behind the doors',
  'minigame.drawCircle': 'Draw one circle, in one go', 'minigame.yourTurn': 'Your turn! Add to the drawing', 'minigame.theirTurn': '{name} is drawing…', 'minigame.voteBest': 'Vote for the best drawing',
  'drawing.submit': 'Send my drawing', 'drawing.undo': 'Undo', 'drawing.clear': 'Start over', 'drawing.blind': 'Drawing blind: you see it when it is sent', 'drawing.colour': 'Colour', 'drawing.size': 'Pen size',
  'host.start': 'Start the game', 'host.close': 'Close answers', 'host.reveal': 'Reveal results', 'host.announce': 'Announce the route', 'host.next': 'Next', 'host.pause': 'Pause', 'host.resume': 'Resume',
} as const;
export type TextKey = keyof typeof TEXT_DEFAULTS;
export const TEXT_KEYS = Object.keys(TEXT_DEFAULTS) as TextKey[];
/** Groups for the editor, in the order a game is played. */
export const TEXT_GROUPS: { title: string; prefix: string }[] = [
  { title: 'Joining', prefix: 'join.' }, { title: 'Room status', prefix: 'status.' }, { title: 'Lobby', prefix: 'lobby.' }, { title: 'Answering', prefix: 'answer.' },
  { title: 'Voting', prefix: 'vote.' }, { title: 'Timer', prefix: 'timer.' }, { title: 'Waiting', prefix: 'wait.' }, { title: 'Progress', prefix: 'progress.' },
  { title: 'Results', prefix: 'results.' }, { title: 'Scores', prefix: 'scores.' }, { title: 'Party choice', prefix: 'route.' }, { title: 'Players', prefix: 'players.' }, { title: 'Round phases', prefix: 'phase.' }, { title: 'Reactions', prefix: 'react.' }, { title: 'Minigames', prefix: 'minigame.' }, { title: 'Drawing', prefix: 'drawing.' }, { title: 'Host buttons', prefix: 'host.' },
];
export function fillText(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => name in values ? String(values[name]) : match);
}

// ---------- look ----------
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const FONTS = { system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', rounded: 'ui-rounded, "SF Pro Rounded", "Varela Round", "Nunito", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif', slab: '"Rockwell", "Roboto Slab", Georgia, serif', mono: 'ui-monospace, Menlo, Consolas, monospace',
  condensed: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif', playful: '"Chalkboard SE", "Comic Neue", "Comic Sans MS", cursive', elegant: '"Didot", "Bodoni 72", "Playfair Display", Georgia, serif' } as const;
export type FontName = keyof typeof FONTS;
const FullColorsSchema = z.object({
  background: Color, background2: Color, surface: Color, text: Color, muted: Color, accent: Color, accentText: Color, success: Color, danger: Color,
  answers: z.array(Color).min(2).max(8), answerText: Color,
});
export const ColorsSchema = FullColorsSchema.partial().strict();
export const ThemeSchema = z.object({
  preset: z.string().max(40).optional(),
  colors: ColorsSchema.optional(),
  font: z.enum(Object.keys(FONTS) as [FontName, ...FontName[]]).optional(), headingFont: z.enum(Object.keys(FONTS) as [FontName, ...FontName[]]).optional(),
  radius: z.number().int().min(0).max(40).optional(), textScale: z.number().min(.8).max(1.6).optional(),
  background: z.enum(['gradient', 'solid', 'dots', 'stripes', 'glow', 'grid']).optional(), tiles: z.enum(['filled', 'outline', 'glass', 'flat']).optional(),
  uppercaseHeadings: z.boolean().optional(),
}).strict();
export type Theme = z.infer<typeof ThemeSchema>;
export type FullTheme = { [K in Exclude<keyof Theme, 'preset' | 'colors'>]-?: NonNullable<Theme[K]> } & { colors: z.infer<typeof FullColorsSchema> };
/** Starting points. Every value can be changed afterwards. */
export const THEME_PRESETS: Record<string, { name: string; theme: FullTheme }> = {
  party: { name: 'Party', theme: { font: 'system', headingFont: 'system', radius: 24, textScale: 1, background: 'glow', tiles: 'filled', uppercaseHeadings: false,
    colors: { background: '#241a4d', background2: '#0f1022', surface: '#2a2547', text: '#f6f3ff', muted: '#c3bce0', accent: '#ffcf4a', accentText: '#2a1d00', success: '#5ee6a8', danger: '#ff8a8a',
      answers: ['#c2185b', '#1d5fc2', '#8a6a00', '#137a52', '#6d3fd6', '#b4530f'], answerText: '#ffffff' } } },
  neon: { name: 'Neon night', theme: { font: 'condensed', headingFont: 'condensed', radius: 6, textScale: 1.05, background: 'grid', tiles: 'outline', uppercaseHeadings: true,
    colors: { background: '#05010f', background2: '#120025', surface: '#120a24', text: '#f2fbff', muted: '#9fb3c8', accent: '#00f0ff', accentText: '#001417', success: '#39ff88', danger: '#ff4f81',
      answers: ['#ff2bd6', '#00c2ff', '#f5e000', '#22ff8a', '#a35bff', '#ff8a00'], answerText: '#05010f' } } },
  pub: { name: 'Pub quiz', theme: { font: 'serif', headingFont: 'slab', radius: 10, textScale: 1, background: 'stripes', tiles: 'flat', uppercaseHeadings: false,
    colors: { background: '#2b1a10', background2: '#140b06', surface: '#3a2416', text: '#fbf1e1', muted: '#d7c2a5', accent: '#e8b04a', accentText: '#2b1a10', success: '#9ad17a', danger: '#ef8a6a',
      answers: ['#7a2e1f', '#1f4e5f', '#6b5b14', '#2f5e2e', '#4a2f5e', '#7a4a14'], answerText: '#fbf1e1' } } },
  clean: { name: 'Clean', theme: { font: 'system', headingFont: 'system', radius: 16, textScale: 1, background: 'solid', tiles: 'filled', uppercaseHeadings: false,
    colors: { background: '#f5f6f8', background2: '#e9ebf0', surface: '#ffffff', text: '#16181d', muted: '#5b6070', accent: '#2251d1', accentText: '#ffffff', success: '#137a52', danger: '#b3261e',
      answers: ['#c2185b', '#1d5fc2', '#8a6a00', '#137a52', '#6d3fd6', '#b4530f'], answerText: '#ffffff' } } },
  retro: { name: 'Retro arcade', theme: { font: 'mono', headingFont: 'mono', radius: 0, textScale: 1, background: 'dots', tiles: 'filled', uppercaseHeadings: true,
    colors: { background: '#1b1b3a', background2: '#0b0b1f', surface: '#26264f', text: '#fffbe6', muted: '#c8c3a3', accent: '#ff5c8a', accentText: '#1b1b3a', success: '#7cff6b', danger: '#ff6b6b',
      answers: ['#c62f3d', '#2459c4', '#8a6a00', '#1a7a42', '#8e44ad', '#a84300'], answerText: '#ffffff' } } },
  kids: { name: 'Bright & playful', theme: { font: 'playful', headingFont: 'rounded', radius: 32, textScale: 1.1, background: 'dots', tiles: 'filled', uppercaseHeadings: false,
    colors: { background: '#fff7e0', background2: '#ffe2ef', surface: '#ffffff', text: '#2a2140', muted: '#6a5f80', accent: '#ff6f3c', accentText: '#2a1300', success: '#1d8a4a', danger: '#c62828',
      answers: ['#d81b60', '#1e63d6', '#8a6a00', '#2e7d32', '#7b3fd6', '#c2410c'], answerText: '#ffffff' } } },
  elegant: { name: 'Gala', theme: { font: 'serif', headingFont: 'elegant', radius: 4, textScale: 1, background: 'gradient', tiles: 'glass', uppercaseHeadings: true,
    colors: { background: '#11131a', background2: '#05060a', surface: '#1b1e28', text: '#f4efe4', muted: '#b9b1a0', accent: '#d4b26a', accentText: '#15120a', success: '#8fcfa4', danger: '#e39a9a',
      answers: ['#8c2f39', '#2c4f7c', '#7d6a2b', '#2f6b52', '#5a3f7a', '#8a5a2b'], answerText: '#f4efe4' } } },
  ocean: { name: 'Ocean', theme: { font: 'rounded', headingFont: 'rounded', radius: 20, textScale: 1, background: 'gradient', tiles: 'glass', uppercaseHeadings: false,
    colors: { background: '#023e5a', background2: '#011627', surface: '#0b3a52', text: '#eefaff', muted: '#a9d3e3', accent: '#5ce1e6', accentText: '#012030', success: '#7ef0b0', danger: '#ff9b9b',
      answers: ['#b0306a', '#1565c0', '#8a6d00', '#00796b', '#5e35b1', '#ad4a00'], answerText: '#ffffff' } } },
};
export const DEFAULT_THEME = 'party';
/** A theme with every value filled in: the preset, then the game's changes, then the scene's. */
export function resolveTheme(...layers: (Theme | undefined)[]): FullTheme {
  let result: FullTheme = THEME_PRESETS[DEFAULT_THEME]!.theme;
  for (const layer of layers) {
    if (!layer) continue;
    const base = layer.preset && THEME_PRESETS[layer.preset] ? THEME_PRESETS[layer.preset]!.theme : result;
    const { preset: _preset, colors, ...rest } = layer;
    result = { ...base, ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)), colors: { ...base.colors, ...(colors ?? {}) } } as FullTheme;
  }
  return result;
}
/** WCAG contrast ratio between two colours, for warnings in the editor. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0]! + .7152 * channels[1]! + .0722 * channels[2]!;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + .05) / (dark + .05);
}

// ---------- motion ----------
export const MOMENTS = {
  sceneEnter: 'A new scene or question appears', answersEnter: 'The answers appear', answerSaved: 'A player’s answer is saved',
  timerEnding: 'The last seconds of the timer', reveal: 'Results are revealed', scoreboard: 'The scoreboard appears', cutscene: 'A cutscene appears', lobbyJoin: 'Someone joins the lobby',
} as const;
export type Moment = keyof typeof MOMENTS;
const Keyframe = z.object({
  at: z.number().min(0).max(1), opacity: z.number().min(0).max(1).optional(), x: z.number().min(-600).max(600).optional(), y: z.number().min(-600).max(600).optional(),
  scale: z.number().min(0).max(4).optional(), rotate: z.number().min(-1080).max(1080).optional(), blur: z.number().min(0).max(40).optional(),
}).strict();
export const EASINGS = { smooth: 'cubic-bezier(.2,.7,.2,1)', linear: 'linear', 'ease-in': 'cubic-bezier(.5,0,.75,0)', 'ease-out': 'cubic-bezier(.25,1,.5,1)', springy: 'cubic-bezier(.34,1.56,.64,1)', snappy: 'cubic-bezier(.7,0,.2,1)' } as const;
export const CustomAnimationSchema = z.object({
  keyframes: z.array(Keyframe).min(2).max(8), durationMs: z.number().int().min(50).max(5000), delayMs: z.number().int().min(0).max(4000).optional(),
  easing: z.enum(Object.keys(EASINGS) as [keyof typeof EASINGS, ...(keyof typeof EASINGS)[]]), staggerMs: z.number().int().min(0).max(1000).optional(), repeat: z.number().int().min(1).max(10).optional(),
}).strict();
export type CustomAnimation = z.infer<typeof CustomAnimationSchema>;
export const AnimationChoiceSchema = z.union([z.object({ preset: z.string().max(40) }).strict(), z.object({ custom: CustomAnimationSchema, name: z.string().max(60).optional() }).strict()]);
export type AnimationChoice = z.infer<typeof AnimationChoiceSchema>;
const anim = (keyframes: z.infer<typeof Keyframe>[], durationMs: number, easing: keyof typeof EASINGS = 'smooth', extra: Partial<CustomAnimation> = {}): CustomAnimation => ({ keyframes, durationMs, easing, ...extra });
/** Ready-made animations. Any of them can be opened in the builder as a starting point. */
export const ANIMATION_PRESETS: Record<string, { name: string; animation: CustomAnimation | null }> = {
  none: { name: 'No animation', animation: null },
  fade: { name: 'Fade in', animation: anim([{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }], 350) },
  rise: { name: 'Rise up', animation: anim([{ at: 0, opacity: 0, y: 40 }, { at: 1, opacity: 1, y: 0 }], 450) },
  drop: { name: 'Drop in', animation: anim([{ at: 0, opacity: 0, y: -60 }, { at: .7, opacity: 1, y: 8 }, { at: 1, y: 0 }], 550, 'ease-out') },
  zoom: { name: 'Zoom in', animation: anim([{ at: 0, opacity: 0, scale: .6 }, { at: 1, opacity: 1, scale: 1 }], 400) },
  pop: { name: 'Pop', animation: anim([{ at: 0, opacity: 0, scale: .4 }, { at: .6, opacity: 1, scale: 1.12 }, { at: 1, scale: 1 }], 450, 'springy') },
  slideLeft: { name: 'Slide from the right', animation: anim([{ at: 0, opacity: 0, x: 120 }, { at: 1, opacity: 1, x: 0 }], 450) },
  slideRight: { name: 'Slide from the left', animation: anim([{ at: 0, opacity: 0, x: -120 }, { at: 1, opacity: 1, x: 0 }], 450) },
  flip: { name: 'Flip', animation: anim([{ at: 0, opacity: 0, rotate: -90, scale: .8 }, { at: 1, opacity: 1, rotate: 0, scale: 1 }], 500, 'ease-out') },
  spin: { name: 'Spin in', animation: anim([{ at: 0, opacity: 0, rotate: -360, scale: .3 }, { at: 1, opacity: 1, rotate: 0, scale: 1 }], 700, 'ease-out') },
  blur: { name: 'Blur in', animation: anim([{ at: 0, opacity: 0, blur: 16 }, { at: 1, opacity: 1, blur: 0 }], 500) },
  bounce: { name: 'Bounce', animation: anim([{ at: 0, y: 0 }, { at: .3, y: -24 }, { at: .55, y: 0 }, { at: .75, y: -10 }, { at: 1, y: 0 }], 700, 'linear') },
  wobble: { name: 'Wobble', animation: anim([{ at: 0, rotate: 0 }, { at: .25, rotate: -6 }, { at: .5, rotate: 5 }, { at: .75, rotate: -3 }, { at: 1, rotate: 0 }], 600, 'linear') },
  shake: { name: 'Shake', animation: anim([{ at: 0, x: 0 }, { at: .2, x: -10 }, { at: .4, x: 10 }, { at: .6, x: -8 }, { at: .8, x: 8 }, { at: 1, x: 0 }], 450, 'linear') },
  pulse: { name: 'Pulse', animation: anim([{ at: 0, scale: 1 }, { at: .5, scale: 1.08 }, { at: 1, scale: 1 }], 600, 'smooth', { repeat: 3 }) },
  cascade: { name: 'One after another', animation: anim([{ at: 0, opacity: 0, y: 24 }, { at: 1, opacity: 1, y: 0 }], 350, 'ease-out', { staggerMs: 90 }) },
};
/** What each moment does unless the game says otherwise. */
export const DEFAULT_ANIMATIONS: Record<Moment, string> = {
  sceneEnter: 'rise', answersEnter: 'cascade', answerSaved: 'pop', timerEnding: 'pulse', reveal: 'zoom', scoreboard: 'cascade', cutscene: 'zoom', lobbyJoin: 'pop',
};
export function resolveAnimation(choice: AnimationChoice | undefined, moment: Moment): CustomAnimation | null {
  if (choice && 'custom' in choice) return choice.custom;
  const preset = choice && 'preset' in choice ? choice.preset : DEFAULT_ANIMATIONS[moment];
  return (ANIMATION_PRESETS[preset] ?? ANIMATION_PRESETS[DEFAULT_ANIMATIONS[moment]]!).animation;
}

// ---------- everything together ----------
const TextsSchema = z.record(z.string(), z.string().max(400)).refine(texts => Object.keys(texts).every(key => key in TEXT_DEFAULTS), 'Unknown text');
const AnimationsSchema = z.record(z.string(), AnimationChoiceSchema).refine(animations => Object.keys(animations).every(key => key in MOMENTS), 'Unknown moment');
export const PresentationSchema = z.object({ texts: TextsSchema.optional(), theme: ThemeSchema.optional(), animations: AnimationsSchema.optional() }).strict();
export type Presentation = z.infer<typeof PresentationSchema>;

import { createContext, useContext, useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { EASINGS, FONTS, fillText, resolveAnimation, resolveTheme, TEXT_DEFAULTS, ThemeSchema, type AnimationChoice, type CustomAnimation, type Moment, type TextKey, type Theme } from '@party/contracts';

export interface LookInput { texts?: Record<string, string>; animations?: Record<string, unknown>; themes?: unknown[] }
export interface Look { text: (key: TextKey, values?: Record<string, string | number>) => string; animation: (moment: Moment) => CustomAnimation | null; theme: ReturnType<typeof resolveTheme> }
const defaultLook: Look = { text: (key, values) => fillText(TEXT_DEFAULTS[key], values), animation: moment => resolveAnimation(undefined, moment), theme: resolveTheme() };
const LookContext = createContext<Look>(defaultLook);
export const useLook = () => useContext(LookContext);
/** The game's text for this key (or the default), with `{placeholders}` filled in. */
export const useText = () => useContext(LookContext).text;

/** CSS variables and classes for a resolved theme; the room styles read only these. */
export function themeStyle(theme: ReturnType<typeof resolveTheme>): CSSProperties {
  const colors = theme.colors; const vars: Record<string, string> = {
    '--r-bg1': colors.background, '--r-bg2': colors.background2, '--r-surface': colors.surface, '--r-text': colors.text, '--r-muted': colors.muted,
    '--r-accent': colors.accent, '--r-accent-ink': colors.accentText, '--r-ok': colors.success, '--r-bad': colors.danger, '--a-text': colors.answerText,
    '--r-radius': `${theme.radius}px`, '--r-font': FONTS[theme.font], '--r-heading-font': FONTS[theme.headingFont], '--r-scale': String(theme.textScale),
  };
  colors.answers.forEach((color, index) => { vars[`--a${index + 1}`] = color; });
  for (let index = colors.answers.length; index < 8; index++) vars[`--a${index + 1}`] = colors.answers[index % colors.answers.length]!;
  return vars as CSSProperties;
}
export const themeClass = (theme: ReturnType<typeof resolveTheme>) => `bg-${theme.background} tiles-${theme.tiles}${theme.uppercaseHeadings ? ' caps' : ''}`;

export function buildLook(look: LookInput | undefined): Look {
  const texts = look?.texts ?? {}; const animations = (look?.animations ?? {}) as Record<string, AnimationChoice>;
  const themes = (look?.themes ?? []).map(theme => ThemeSchema.safeParse(theme)).filter(result => result.success).map(result => result.data as Theme);
  return { text: (key, values) => fillText(texts[key] ?? TEXT_DEFAULTS[key], values), animation: moment => resolveAnimation(animations[moment], moment), theme: resolveTheme(...themes) };
}
/** Builds the look once per change of its input; use with `LookContext.Provider`. */
export const useBuiltLook = (look: LookInput | undefined) => useMemo(() => buildLook(look), [look]);
export { LookContext };
export function LookProvider({ look, children, render }: { look: LookInput | undefined; children?: ReactNode; render?: (style: CSSProperties, className: string) => ReactNode }) {
  const value = useBuiltLook(look);
  return <LookContext.Provider value={value}>{render ? render(themeStyle(value.theme), themeClass(value.theme)) : children}</LookContext.Provider>;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Plays an animation on an element, or on its children one after another when it has a stagger. */
export function play(element: Element | null, animation: CustomAnimation | null, options: { staggerChildren?: boolean } = {}) {
  if (!element || !animation || typeof (element as HTMLElement).animate !== 'function') return;
  // Reduced motion: nothing moves, fades, spins or repeats.
  if (reducedMotion()) return;
  let last = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, blur: 0 };
  const frames = animation.keyframes.map(frame => {
    last = { opacity: frame.opacity ?? last.opacity, x: frame.x ?? last.x, y: frame.y ?? last.y, scale: frame.scale ?? last.scale, rotate: frame.rotate ?? last.rotate, blur: frame.blur ?? last.blur };
    return { offset: frame.at, opacity: last.opacity, transform: `translate(${last.x}px, ${last.y}px) scale(${last.scale}) rotate(${last.rotate}deg)`, filter: last.blur ? `blur(${last.blur}px)` : 'none' };
  });
  const timing = (index: number): KeyframeAnimationOptions => ({ duration: animation.durationMs, delay: (animation.delayMs ?? 0) + index * (animation.staggerMs ?? 0), easing: EASINGS[animation.easing], iterations: animation.repeat ?? 1, fill: 'backwards' });
  // Lists animate item by item: answers, tiles, scoreboard rows, players.
  const items = options.staggerChildren && animation.staggerMs ? [...element.querySelectorAll('.tile, .options-board > li, .choice, .order-list > li, .scoreboard > li, .answer-bars > li, .players li, .ballot-entry')] : [];
  const targets = items.length ? items : [element];
  targets.forEach((target, index) => { (target as HTMLElement).animate(frames, timing(index)); });
}
/** Plays the game's animation for a moment whenever `trigger` changes (and is truthy). */
export function useMoment(ref: RefObject<Element | null>, moment: Moment, trigger: unknown, options: { staggerChildren?: boolean } = {}, given?: Look) {
  const context = useLook(); const animation = (given ?? context).animation; const previous = useRef<unknown>(undefined);
  useEffect(() => {
    if (!trigger || trigger === previous.current) return;
    previous.current = trigger; play(ref.current, animation(moment), options);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

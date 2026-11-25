import { createContext, useContext, useEffect, useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { currentLanguage, useLanguage, type Language } from '../i18n/language.js';
import { translate } from '../i18n/texts.js';
import { GAME_TEXTS } from './game-texts.text.js';
import { fontCssFamily, useThemeFonts } from './theme-fonts.js';
import { gameHowToPlay } from './catalog.text.js';
import { contrast, EASINGS, fillText, resolveAnimation, resolveTheme, TEXT_DEFAULTS, ThemeSchema, type AnimationChoice, type CustomAnimation, type Moment, type TextKey, type TranslatedTexts, type Theme } from '@party/contracts';

export interface LookInput { texts?: Record<string, string>; translations?: TranslatedTexts | undefined; animations?: Record<string, unknown>; themes?: unknown[] }
export interface Look { text: (key: TextKey, values?: Record<string, string | number>) => string; animation: (moment: Moment) => CustomAnimation | null; theme: ReturnType<typeof resolveTheme> }
const defaultLook: Look = { text: (key, values) => fillText(standardText(key, currentLanguage()), values), animation: moment => resolveAnimation(undefined, moment), theme: resolveTheme() };
const LookContext = createContext<Look>(defaultLook);
export const useLook = () => useContext(LookContext);
/** The game's text for this key (or the default), with `{placeholders}` filled in. */
export const useText = () => useContext(LookContext).text;

const shine = (text: string) => contrast(text, '#ffffff') > contrast(text, '#000000') ? '#ffffff' : '#000000';
/** CSS variables and classes for a resolved theme; the room styles read only these. */
export function themeStyle(theme: ReturnType<typeof resolveTheme>): CSSProperties {
  const colors = theme.colors; const vars: Record<string, string> = {
    '--r-bg1': colors.background, '--r-bg2': colors.background2, '--r-surface': colors.surface, '--r-text': colors.text, '--r-muted': colors.muted,
    '--r-accent': colors.accent, '--r-accent-ink': colors.accentText, '--r-ok': colors.success, '--r-bad': colors.danger, '--a-text': colors.answerText,
    // For gradient tiles and buttons: the shine goes towards white under dark text and towards black under light text, so text stays readable.
    '--a-shine': shine(colors.answerText), '--r-accent-shine': shine(colors.accentText),
    '--r-radius': `${theme.radius}px`, '--r-font': fontCssFamily(theme.font), '--r-heading-font': fontCssFamily(theme.headingFont), '--r-scale': String(theme.textScale),
  };
  // The clock's own colours, only when chosen (the room styles fall back to text, accent and danger).
  if (theme.timerColors.face) vars['--r-clock-face'] = theme.timerColors.face;
  if (theme.timerColors.time) vars['--r-clock-time'] = theme.timerColors.time;
  if (theme.timerColors.ending) vars['--r-clock-ending'] = theme.timerColors.ending;
  colors.answers.forEach((color, index) => { vars[`--a${index + 1}`] = color; });
  for (let index = colors.answers.length; index < 8; index++) vars[`--a${index + 1}`] = colors.answers[index % colors.answers.length]!;
  return vars as CSSProperties;
}
export function useThemeStyle(theme: ReturnType<typeof resolveTheme>) {
  useThemeFonts(theme);
  return themeStyle(theme);
}
export const themeClass = (theme: ReturnType<typeof resolveTheme>) => `bg-${theme.background} motion-${theme.backgroundMotion} tiles-${theme.tiles}${theme.uppercaseHeadings ? ' caps' : ''}${theme.gradients ? ' gradients' : ''} marks-${theme.markerShape} marks-${theme.markerPlace}`;

/**
 * A standard text (one the author did not change) in a language: the game's texts in every language, and the
 * minigames' “how to play” from the catalog. English is the source, and the fallback for anything missing.
 */
export function standardText(key: TextKey, language: Language): string {
  if (language === 'en') return TEXT_DEFAULTS[key];
  if (key.startsWith('minigame.how.')) { const game = key.slice('minigame.how.'.length); return gameHowToPlay(game, language) || TEXT_DEFAULTS[key]; }
  return translate(GAME_TEXTS, key as keyof typeof GAME_TEXTS.en, undefined, language);
}
/** The look in a language: texts the author changed stay as written; every other text is the standard one in that language. */
export function buildLook(look: LookInput | undefined, language: Language = currentLanguage()): Look {
  const texts = look?.texts ?? {}; const animations = (look?.animations ?? {}) as Record<string, AnimationChoice>;
  const themes = (look?.themes ?? []).map(theme => ThemeSchema.safeParse(theme)).filter(result => result.success).map(result => result.data as Theme);
  return { text: (key, values) => fillText(look?.translations?.[language]?.[key] ?? texts[key] ?? standardText(key, language), values), animation: moment => resolveAnimation(animations[moment], moment), theme: resolveTheme(...themes) };
}
/** Builds the look once per change of its input; use with `LookContext.Provider`. */
export const useBuiltLook = (look: LookInput | undefined) => { const language = useLanguage(); return useMemo(() => buildLook(look, language), [look, language]); };
export { LookContext };
export function LookProvider({ look, children, render }: { look: LookInput | undefined; children?: ReactNode; render?: (style: CSSProperties, className: string) => ReactNode }) {
  const value = useBuiltLook(look);
  const style = useThemeStyle(value.theme);
  return <LookContext.Provider value={value}>{render ? render(style, themeClass(value.theme)) : children}</LookContext.Provider>;
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

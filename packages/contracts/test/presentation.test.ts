import { describe, expect, it } from 'vitest';
import { ANIMATION_PRESETS, contrast, DEFAULT_ANIMATIONS, fillText, MOMENTS, PresentationSchema, resolveAnimation, resolveTheme, TEXT_DEFAULTS, THEME_PRESETS } from '../src/index.js';

describe('game look', () => {
  it.each(Object.entries(THEME_PRESETS))('keeps every text readable in the “%s” theme', (_key, { theme }) => {
    const { colors } = theme;
    expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.muted, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.accentText, colors.accent)).toBeGreaterThanOrEqual(4.5);
    for (const answer of colors.answers) expect(contrast(colors.answerText, answer)).toBeGreaterThanOrEqual(4.5);
  });
  it('layers a preset, the game’s changes and a scene’s changes', () => {
    const theme = resolveTheme({ preset: 'neon', colors: { accent: '#123456' } }, { radius: 3 });
    expect(theme).toMatchObject({ font: THEME_PRESETS['neon']!.theme.font, radius: 3, colors: { accent: '#123456', background: THEME_PRESETS['neon']!.theme.colors.background } });
    expect(resolveTheme()).toEqual(THEME_PRESETS['party']!.theme);
  });
  it('accepts only known texts and moments, valid colours and bounded animations', () => {
    expect(PresentationSchema.safeParse({ texts: { 'answer.saved': 'Locked in, {name}!' }, theme: { preset: 'pub', colors: { accent: '#ffaa00' }, radius: 12 },
      animations: { reveal: { preset: 'pop' }, sceneEnter: { custom: { keyframes: [{ at: 0, opacity: 0, rotate: 90 }, { at: 1, opacity: 1 }], durationMs: 600, easing: 'springy' } } } }).success).toBe(true);
    for (const bad of [{ texts: { 'no.such.text': 'x' } }, { theme: { colors: { accent: 'red' } } }, { theme: { colors: { accent: 'url(https://evil.example)' } } }, { theme: { css: 'body{}' } },
      { animations: { nowhere: { preset: 'pop' } } }, { animations: { reveal: { custom: { keyframes: [{ at: 0 }], durationMs: 100, easing: 'smooth' } } } }, { animations: { reveal: { custom: { keyframes: [{ at: 0 }, { at: 1, scale: 99 }], durationMs: 100, easing: 'smooth' } } } }]) {
      expect(PresentationSchema.safeParse(bad).success).toBe(false);
    }
  });
  it('has a default for every text and moment, and fills in placeholders', () => {
    expect(fillText(TEXT_DEFAULTS['timer.left'], { time: '0:10' })).toBe('0:10 left');
    expect(fillText('Hi {name}, {unknown}', { name: 'Ada' })).toBe('Hi Ada, {unknown}');
    for (const moment of Object.keys(MOMENTS) as (keyof typeof MOMENTS)[]) { expect(ANIMATION_PRESETS[DEFAULT_ANIMATIONS[moment]]).toBeDefined(); expect(resolveAnimation({ preset: 'nonsense' }, moment)).not.toBeUndefined(); }
    expect(resolveAnimation({ preset: 'none' }, 'reveal')).toBeNull();
  });
});

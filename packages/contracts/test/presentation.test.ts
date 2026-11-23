import { describe, expect, it } from 'vitest';
import { ANIMATION_PRESETS, answerMark, contrast, DEFAULT_ANIMATIONS, fillText, MOMENTS, PresentationSchema, resolveAnimation, resolveTheme, TEXT_DEFAULTS, THEME_PRESETS } from '../src/index.js';

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
  it('accepts see-through colours (#rrggbbaa) and reads their contrast as mixed over what is behind', () => {
    expect(PresentationSchema.safeParse({ theme: { colors: { surface: '#18213c80', answers: ['#ff000080', '#00ff00'] } } }).success).toBe(true);
    for (const bad of ['#1234567', '#123456789', 'rgba(1, 2, 3, .5)']) expect(PresentationSchema.safeParse({ theme: { colors: { accent: bad } } }).success).toBe(false);
    // Fully see-through text vanishes into the background; half see-through sits between.
    expect(contrast('#ffffff00', '#000000')).toBeCloseTo(1);
    expect(contrast('#ffffffff', '#000000')).toBeCloseTo(contrast('#ffffff', '#000000'));
    const half = contrast('#ffffff80', '#000000');
    expect(half).toBeGreaterThan(1); expect(half).toBeLessThan(contrast('#ffffff', '#000000'));
  });
  it('has a default for every text and moment, and fills in placeholders', () => {
    expect(fillText(TEXT_DEFAULTS['timer.left'], { time: '0:10' })).toBe('0:10 left');
    expect(fillText('Hi {name}, {unknown}', { name: 'Ada' })).toBe('Hi Ada, {unknown}');
    for (const moment of Object.keys(MOMENTS) as (keyof typeof MOMENTS)[]) { expect(ANIMATION_PRESETS[DEFAULT_ANIMATIONS[moment]]).toBeDefined(); expect(resolveAnimation({ preset: 'nonsense' }, moment)).not.toBeUndefined(); }
    expect(resolveAnimation({ preset: 'none' }, 'reveal')).toBeNull();
  });
});

describe('answer marks', () => {
  const theme = (markers: 'letters' | 'numbers' | 'shapes' | 'none', routeMarkers: 'arrows' | 'answers' = 'arrows') => ({ markers, routeMarkers });
  it('are letters by default and numbers, shapes or nothing when chosen', () => {
    expect([0, 1, 2].map(index => answerMark(resolveTheme(), index, 3))).toEqual(['A', 'B', 'C']);
    expect([0, 1, 2].map(index => answerMark(theme('numbers'), index, 3))).toEqual(['1', '2', '3']);
    expect(new Set([0, 1, 2, 3].map(index => answerMark(theme('shapes'), index, 4))).size).toBe(4);
    expect(answerMark(theme('none'), 0, 2)).toBeNull();
  });
  it('can be the author’s own, repeating when there are more answers, and fall back to letters without any', () => {
    const own = { markers: 'custom' as const, routeMarkers: 'arrows' as const, customMarks: ['🎄', 'Ja'] };
    expect([0, 1, 2].map(index => answerMark(own, index, 3))).toEqual(['🎄', 'Ja', '🎄']);
    expect(answerMark({ ...own, customMarks: [] }, 1, 3)).toBe('B');
    expect(PresentationSchema.safeParse({ theme: { markers: 'custom', customMarks: ['🎄', 'Ja'] } }).success).toBe(true);
    expect(PresentationSchema.safeParse({ theme: { customMarks: ['x'.repeat(13)] } }).success).toBe(false);
    expect(PresentationSchema.safeParse({ theme: { customMarks: Array.from({ length: 9 }, () => 'x') } }).success).toBe(false);
  });
  it('give party choices signpost arrows unless they follow the answers', () => {
    expect([0, 1].map(index => answerMark(theme('numbers'), index, 2, true))).toEqual(['←', '→']);
    expect([0, 1].map(index => answerMark(theme('numbers', 'answers'), index, 2, true))).toEqual(['1', '2']);
  });
});

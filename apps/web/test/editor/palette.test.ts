import { describe, expect, it } from 'vitest';
import { contrast, THEME_PRESETS } from '@party/contracts';
import { applyPalette, namedColors, parseAse, parsePaletteText, toAse, toHexList, toTokens } from '../../src/editor/look/palette.js';

describe('importing a colour palette', () => {
  it('reads hex codes as Canva and Figma copy them, in order and without repeats', () => {
    expect(parsePaletteText('#009EE2, #f39200\n#7ac6b6 #009ee2 #fff')).toEqual(['#009ee2', '#f39200', '#7ac6b6', '#ffffff']);
  });
  it('reads a Coolors link, CSS with rgb(), design tokens and SVG', () => {
    expect(parsePaletteText('https://coolors.co/009ee2-f39200-7ac6b6')).toEqual(['#009ee2', '#f39200', '#7ac6b6']);
    expect(parsePaletteText(':root { --brand: rgb(0, 158, 226); --second: rgb(243 146 0 / 50%); }')).toEqual(['#009ee2', '#f39200']);
    expect(parsePaletteText(JSON.stringify({ brand: { blue: { $type: 'color', $value: '#009ee2ff' } } }))).toEqual(['#009ee2']);
    expect(parsePaletteText('<svg><rect fill="#f39200"/><rect fill="#7AC6B6"/></svg>')).toEqual(['#f39200', '#7ac6b6']);
  });
  it('reads a GIMP palette and ignores words that only look like colours', () => {
    expect(parsePaletteText('GIMP Palette\nName: Brand\n#\n  0 158 226\tBlue\n243 146   0 Orange\n')).toEqual(['#009ee2', '#f39200']);
    expect(parsePaletteText('Answer #12a5 and #ghijkl')).toEqual([]);
  });
  it('reads back the Adobe swatch file it writes (.ase)', () => {
    const colors = namedColors(THEME_PRESETS['mbou']!.theme.colors);
    const bytes = toAse(colors);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('ASEF');
    expect(parseAse(bytes.buffer)).toEqual([...new Set(colors.map(color => color.hex))]);
    expect(parseAse(new ArrayBuffer(4))).toEqual([]);
  });
  it('puts imported colours on the answers and buttons with text that reads best on them', () => {
    const bright = applyPalette(['#009ee2', '#f39200', '#7ac6b6']);
    expect(bright).toMatchObject({ answers: ['#009ee2', '#f39200', '#7ac6b6'], accent: '#009ee2', answerText: '#1a1a1a', accentText: '#000000' });
    for (const tile of bright.answers!) expect(contrast(bright.answerText!, tile)).toBeGreaterThanOrEqual(4.5);
    expect(applyPalette(['#1b1b3a', '#2a1d5c'])).toMatchObject({ answerText: '#ffffff', accentText: '#ffffff' });
    expect(applyPalette(['#123456']).answers).toHaveLength(2);
    expect(applyPalette(Array.from({ length: 12 }, (_, index) => `#0000${String(index).padStart(2, '0')}`)).answers).toHaveLength(8);
  });
});

describe('exporting a colour palette', () => {
  const colors = THEME_PRESETS['mbou']!.theme.colors;
  it('lists every colour once as hex codes, answers first', () => {
    const list = toHexList(colors).split('\n');
    expect(list[0]).toBe(colors.answers[0]); expect(new Set(list).size).toBe(list.length);
  });
  it('writes design tokens that read back to the same colours', () => {
    const tokens = JSON.parse(toTokens(colors, 'Quiz night!'));
    expect(tokens['quiz-night']['answer-a']).toEqual({ $type: 'color', $value: colors.answers[0] });
    expect(parsePaletteText(toTokens(colors, 'x'))).toEqual(parsePaletteText(toHexList(colors)));
  });
});

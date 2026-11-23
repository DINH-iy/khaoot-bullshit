import { describe, expect, it } from 'vitest';
import { hsvToRgb, parseColor, rgbToHsv, toHex, toRgbaText } from '../../src/ui/color.js';

describe('colour codes in the colour picker', () => {
  it('reads every hex form, with or without #, and keeps the opacity of 4- and 8-digit codes', () => {
    expect(parseColor('#336699')).toEqual({ r: 51, g: 102, b: 153, a: 1 });
    expect(parseColor('369')).toEqual({ r: 51, g: 102, b: 153, a: 1 });
    expect(parseColor(' #336699 ')).toEqual({ r: 51, g: 102, b: 153, a: 1 });
    expect(parseColor('#33669980')).toEqual({ r: 51, g: 102, b: 153, a: .5 });
    expect(parseColor('#3698')).toEqual({ r: 51, g: 102, b: 153, a: .53 });
  });
  it('reads rgb() and rgba() with commas, spaces, a slash and percentages, clamped to range', () => {
    expect(parseColor('rgb(51, 102, 153)')).toEqual({ r: 51, g: 102, b: 153, a: 1 });
    expect(parseColor('RGBA(51,102,153,.25)')).toEqual({ r: 51, g: 102, b: 153, a: .25 });
    expect(parseColor('rgb(51 102 153 / 40%)')).toEqual({ r: 51, g: 102, b: 153, a: .4 });
    expect(parseColor('rgba(300, -4, 100%, 2)')).toEqual({ r: 255, g: 0, b: 255, a: 1 });
  });
  it('refuses what is not a colour code (so nothing half-typed is applied)', () => {
    for (const text of ['', '#33', '#33669', 'blue', 'rgb(1, 2)', 'rgb(a, b, c)', 'url(x)', '#3366999']) expect(parseColor(text)).toBeNull();
  });
  it('stores solid colours as #rrggbb and see-through ones as #rrggbbaa', () => {
    expect(toHex({ r: 51, g: 102, b: 153, a: 1 })).toBe('#336699');
    expect(toHex({ r: 51, g: 102, b: 153, a: .5 })).toBe('#33669980');
    expect(toHex({ r: 51, g: 102, b: 153, a: 0 })).toBe('#33669900');
    expect(toRgbaText({ r: 51, g: 102, b: 153, a: .5 })).toBe('rgba(51, 102, 153, 0.5)');
  });
  it('turns hue and shade into the same colour and back', () => {
    for (const hex of ['#336699', '#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#7ac6b680', '#f39200']) {
      expect(toHex(hsvToRgb(rgbToHsv(parseColor(hex)!)))).toBe(hex);
    }
    expect(rgbToHsv({ r: 255, g: 0, b: 0, a: 1 })).toEqual({ h: 0, s: 1, v: 1, a: 1 });
  });
});

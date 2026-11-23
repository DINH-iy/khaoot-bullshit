// Colour values for the colour picker: read what people type or paste (hex or rgb/rgba),
// convert between the picker's hue/shade model and red/green/blue, and write the stored hex.
// Stored colours are `#rrggbb`, or `#rrggbbaa` when they are see-through.

/** Red, green and blue 0–255, and opacity 0–1. */
export interface Rgba { r: number; g: number; b: number; a: number }
/** Hue 0–360, saturation and brightness 0–1, opacity 0–1. */
export interface Hsva { h: number; s: number; v: number; a: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const hex2 = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');

/**
 * A colour from text: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (the # may be left out),
 * `rgb(1, 2, 3)`, `rgba(1, 2, 3, .5)` or `rgb(1 2 3 / 50%)`. Null when it is not a colour.
 */
export function parseColor(text: string): Rgba | null {
  const value = text.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map(char => char + char).join('') : hex;
    const channel = (index: number) => parseInt(full.slice(index * 2, index * 2 + 2), 16);
    return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? Math.round(channel(3) / 255 * 100) / 100 : 1 };
  }
  const call = /^rgba?\(\s*([^)]*)\)$/.exec(value)?.[1];
  if (call === undefined) return null;
  const parts = call.split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const number = (part: string, scale: number) => {
    const percent = part.endsWith('%'); const amount = Number(percent ? part.slice(0, -1) : part);
    return Number.isFinite(amount) ? (percent ? amount / 100 * scale : amount) : NaN;
  };
  const [r, g, b] = parts.slice(0, 3).map(part => number(part, 255)) as [number, number, number];
  const a = parts[3] === undefined ? 1 : number(parts[3], 1);
  if ([r, g, b, a].some(Number.isNaN)) return null;
  return { r: clamp(Math.round(r), 0, 255), g: clamp(Math.round(g), 0, 255), b: clamp(Math.round(b), 0, 255), a: clamp(a, 0, 1) };
}

/** The stored form: `#rrggbb` when solid, `#rrggbbaa` when see-through. */
export function toHex({ r, g, b, a }: Rgba): string {
  const alpha = Math.round(clamp(a, 0, 1) * 255);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha === 255 ? '' : hex2(alpha)}`;
}

/** The CSS `rgba()` form, as shown in the picker's RGBA view. */
export const toRgbaText = ({ r, g, b, a }: Rgba) => `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;

export function rgbToHsv({ r, g, b, a }: Rgba): Hsva {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue); const range = max - Math.min(red, green, blue);
  const h = range === 0 ? 0 : max === red ? ((green - blue) / range + 6) % 6 : max === green ? (blue - red) / range + 2 : (red - green) / range + 4;
  return { h: h * 60, s: max === 0 ? 0 : range / max, v: max, a };
}

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const channel = (n: number) => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return { r: channel(5), g: channel(3), b: channel(1), a };
}

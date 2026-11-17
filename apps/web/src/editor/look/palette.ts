import { contrast, type FullTheme } from '@party/contracts';

// Colour palettes in and out of the Look & feel, in the forms design tools use:
// hex codes (Canva brand kits, Figma, any text), Coolors links, CSS, design-token JSON,
// SVG, GIMP palettes (.gpl) and Adobe Swatch Exchange files (.ase: Adobe, Procreate, Affinity).
type Colors = FullTheme['colors'];
export const MAX_COLORS = 16;

const hex2 = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const unique = (colors: string[]) => [...new Set(colors.map(color => color.toLowerCase()))].slice(0, MAX_COLORS);

/** Every colour found in a piece of text, in order, without repeats. */
export function parsePaletteText(text: string): string[] {
  const found: { at: number; color: string }[] = [];
  // #rgb, #rrggbb (and #rrggbbaa: the alpha is dropped).
  for (const match of text.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/gi)) {
    const value = match[1]!;
    found.push({ at: match.index!, color: value.length === 3 ? `#${[...value].map(char => char + char).join('')}` : `#${value.slice(0, 6)}` });
  }
  // rgb(1, 2, 3) and rgb(1 2 3 / 50%).
  for (const match of text.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) found.push({ at: match.index!, color: toHex(Number(match[1]), Number(match[2]), Number(match[3])) });
  // A Coolors link: coolors.co/009ee2-f39200-7ac6b6 (also /palette/…).
  for (const match of text.matchAll(/coolors\.co\/(?:palette\/)?((?:[0-9a-f]{6}-?)+)/gi)) {
    match[1]!.split('-').filter(Boolean).forEach((value, index) => found.push({ at: match.index! + index, color: `#${value}` }));
  }
  // A GIMP palette: lines of "R G B name" after the "GIMP Palette" header.
  if (/^GIMP Palette/m.test(text)) {
    let offset = 0;
    for (const line of text.split('\n')) {
      const match = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(\s|$)/.exec(line);
      if (match) found.push({ at: offset, color: toHex(Number(match[1]), Number(match[2]), Number(match[3])) });
      offset += line.length + 1;
    }
  }
  return unique(found.sort((a, b) => a.at - b.at).map(entry => entry.color));
}

/** The colours in an Adobe Swatch Exchange file (RGB, grey and CMYK swatches; Lab is skipped). */
export function parseAse(buffer: ArrayBuffer): string[] {
  const view = new DataView(buffer); const colors: string[] = [];
  if (buffer.byteLength < 12 || view.getUint32(0) !== 0x41534546) return []; // "ASEF"
  const blocks = view.getUint32(8); let at = 12;
  for (let block = 0; block < blocks && at + 6 <= buffer.byteLength; block++) {
    const type = view.getUint16(at); const length = view.getUint32(at + 2); const start = at + 6; at = start + length;
    if (type !== 0x0001 || at > buffer.byteLength) continue; // only colour entries (not group start/end)
    const nameLength = view.getUint16(start); let pos = start + 2 + nameLength * 2;
    const model = String.fromCharCode(...[0, 1, 2, 3].map(offset => view.getUint8(pos + offset))); pos += 4;
    const value = (index: number) => view.getFloat32(pos + index * 4);
    if (model === 'RGB ') colors.push(toHex(value(0) * 255, value(1) * 255, value(2) * 255));
    else if (model === 'Gray') colors.push(toHex(value(0) * 255, value(0) * 255, value(0) * 255));
    else if (model === 'CMYK') { const [c, m, y, k] = [value(0), value(1), value(2), value(3)]; colors.push(toHex(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k))); }
  }
  return unique(colors);
}

/** The colours in a chosen file: .ase is read as binary, everything else as text. */
export async function parsePaletteFile(file: File): Promise<string[]> {
  if (file.name.toLowerCase().endsWith('.ase')) return parseAse(await file.arrayBuffer());
  return parsePaletteText(await file.text());
}

/** Black or white, whichever is easier to read on every one of these colours. */
export function readableOn(backgrounds: string[]): string {
  const worst = (text: string) => Math.min(...backgrounds.map(background => contrast(text, background)));
  return worst('#000000') >= worst('#ffffff') ? '#1a1a1a' : '#ffffff';
}

/**
 * A palette applied to a look: its colours become the answer tiles (2 to 8) and the
 * first one the main buttons; the text on them becomes black or white, whichever reads
 * better. The background and text colours stay, so the look stays readable.
 */
export function applyPalette(colors: string[]): Partial<Colors> {
  const answers = colors.slice(0, 8);
  if (answers.length === 1) answers.push(answers[0]!);
  return { answers, answerText: readableOn(answers), accent: answers[0]!, accentText: readableOn([answers[0]!]) === '#1a1a1a' ? '#000000' : '#ffffff' };
}

// ---------- export ----------
const NAMES: Record<Exclude<keyof Colors, 'answers'>, string> = {
  background: 'Background', background2: 'Background 2', surface: 'Cards', text: 'Text', muted: 'Quiet text',
  accent: 'Main buttons', accentText: 'Text on main buttons', success: 'Correct', danger: 'Wrong', answerText: 'Text on answers',
};
/** Every colour of a look with a name, answers first (the palette people usually want). */
export function namedColors(colors: Colors): { name: string; hex: string }[] {
  return [...colors.answers.map((hex, index) => ({ name: `Answer ${String.fromCharCode(65 + index)}`, hex })),
    ...(Object.keys(NAMES) as (keyof typeof NAMES)[]).map(key => ({ name: NAMES[key], hex: colors[key] }))];
}
/** Hex codes, one per line: pastes into Canva brand kits, Figma, Coolors and most tools. */
export const toHexList = (colors: Colors) => unique(namedColors(colors).map(color => color.hex)).join('\n');
/** Design tokens (the W3C format Figma's Tokens Studio and other tools read). */
export function toTokens(colors: Colors, title: string): string {
  const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return JSON.stringify({ [slug(title) || 'game']: Object.fromEntries(namedColors(colors).map(color => [slug(color.name), { $type: 'color', $value: color.hex }])) }, null, 2);
}
/** An Adobe Swatch Exchange file (.ase): Illustrator, Photoshop, InDesign, Procreate, Affinity. */
export function toAse(colors: { name: string; hex: string }[]): Uint8Array<ArrayBuffer> {
  const blocks = colors.map(({ name, hex }) => {
    const label = `${name}\0`; const length = 2 + label.length * 2 + 4 + 12 + 2;
    const bytes = new DataView(new ArrayBuffer(6 + length)); let at = 0;
    bytes.setUint16(at, 0x0001); bytes.setUint32(at + 2, length); at += 6;
    bytes.setUint16(at, label.length); at += 2;
    for (const char of label) { bytes.setUint16(at, char.charCodeAt(0)); at += 2; }
    for (const char of 'RGB ') { bytes.setUint8(at, char.charCodeAt(0)); at += 1; }
    for (const index of [1, 3, 5]) { bytes.setFloat32(at, parseInt(hex.slice(index, index + 2), 16) / 255); at += 4; }
    bytes.setUint16(at, 2); // a normal (not global or spot) colour
    return new Uint8Array(bytes.buffer);
  });
  const header = new DataView(new ArrayBuffer(12));
  header.setUint32(0, 0x41534546); header.setUint16(4, 1); header.setUint16(6, 0); header.setUint32(8, blocks.length);
  const out = new Uint8Array(12 + blocks.reduce((sum, block) => sum + block.length, 0)); out.set(new Uint8Array(header.buffer), 0);
  let offset = 12; for (const block of blocks) { out.set(block, offset); offset += block.length; }
  return out;
}

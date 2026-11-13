import { z } from 'zod';

/**
 * A player's own look: a character put together from built-in parts. Only
 * names from these lists are accepted, so a look can never carry pictures,
 * links or code. Photos and drawn avatars are a later slice.
 */
export const LOOK_COLORS = ['#e8505b', '#f28c28', '#f2c230', '#7bc950', '#2bb3a3', '#36a2eb', '#4f6ae0', '#8e5be8', '#d45bc4', '#f07aa8', '#8d6e63', '#78909c'] as const;
export const LOOK_PARTS = {
  body: ['blob', 'round', 'square', 'ghost', 'cat', 'bear', 'robot', 'alien'],
  eyes: ['dots', 'happy', 'wide', 'sleepy', 'wink', 'stars', 'angry', 'cute'],
  mouth: ['smile', 'grin', 'open', 'tongue', 'flat', 'o', 'teeth', 'smirk'],
  hat: ['none', 'crown', 'cap', 'party', 'beanie', 'horns', 'bow', 'halo', 'tophat', 'antenna'],
  extra: ['none', 'glasses', 'shades', 'mustache', 'blush', 'freckles', 'eyepatch', 'bandaid'],
} as const;
export type LookPart = keyof typeof LOOK_PARTS;
const part = <K extends LookPart>(key: K) => z.enum(LOOK_PARTS[key] as unknown as [typeof LOOK_PARTS[K][number], ...typeof LOOK_PARTS[K][number][]]);
export const PlayerLookSchema = z.object({
  color: z.number().int().min(0).max(LOOK_COLORS.length - 1), body: part('body'), eyes: part('eyes'), mouth: part('mouth'), hat: part('hat'), extra: part('extra'),
  // Optional: a photo taken on the phone or a drawing, shown instead of the character. Stored by the server; the character stays as the fallback.
  picture: z.object({ assetId: z.string().uuid(), kind: z.enum(['photo', 'drawing']) }).strict().optional(),
}).strict();
export type PlayerLook = z.infer<typeof PlayerLookSchema>;

/** Plain-language names for the builder. */
export const LOOK_PART_NAMES: { [K in LookPart]: { title: string; names: Record<typeof LOOK_PARTS[K][number], string> } } = {
  body: { title: 'Character', names: { blob: 'Blob', round: 'Ball', square: 'Block', ghost: 'Ghost', cat: 'Cat', bear: 'Bear', robot: 'Robot', alien: 'Alien' } },
  eyes: { title: 'Eyes', names: { dots: 'Dots', happy: 'Happy', wide: 'Wide awake', sleepy: 'Sleepy', wink: 'Wink', stars: 'Starry', angry: 'Fierce', cute: 'Sparkly' } },
  mouth: { title: 'Mouth', names: { smile: 'Smile', grin: 'Big grin', open: 'Laughing', tongue: 'Tongue out', flat: 'Unimpressed', o: 'Surprised', teeth: 'Toothy', smirk: 'Smirk' } },
  hat: { title: 'Hat', names: { none: 'No hat', crown: 'Crown', cap: 'Cap', party: 'Party hat', beanie: 'Beanie', horns: 'Horns', bow: 'Bow', halo: 'Halo', tophat: 'Top hat', antenna: 'Antenna' } },
  extra: { title: 'Extra', names: { none: 'Nothing', glasses: 'Glasses', shades: 'Sunglasses', mustache: 'Moustache', blush: 'Blush', freckles: 'Freckles', eyepatch: 'Eye patch', bandaid: 'Plaster' } },
};

/** Every player has a look from the start, made from their ID; they can change it whenever they like. */
export function defaultLook(seed: string): PlayerLook {
  let hash = 2166136261;
  const next = (size: number) => { for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0; hash = Math.imul(hash ^ size, 2246822519) >>> 0; return hash % size; };
  const pick = <K extends LookPart>(key: K, skipNone = false) => { const list = LOOK_PARTS[key].filter(entry => !skipNone || entry !== 'none'); return list[next(list.length)] as typeof LOOK_PARTS[K][number]; };
  return { color: next(LOOK_COLORS.length), body: pick('body'), eyes: pick('eyes'), mouth: pick('mouth'), hat: next(3) === 0 ? pick('hat', true) : 'none', extra: next(4) === 0 ? pick('extra', true) : 'none' };
}

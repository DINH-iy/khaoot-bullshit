import { z } from 'zod';

/**
 * A game's own reactions and its soundboard. Reactions float up on the shared screen like the standard
 * ones; a game adds its own emoji, short texts and pictures (GIFs too) from the media library. The
 * soundboard lets players play a short sound on the shared screen (on the host's screen without one),
 * limited so a room never turns into noise: one sound at a time, and a wait per player.
 */
export const MAX_OWN_REACTIONS = 12;
export const OwnReactionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('emoji'), text: z.string().trim().min(1).max(16) }).strict(),
  z.object({ kind: z.literal('text'), text: z.string().trim().min(1).max(16) }).strict(),
  // A picture or GIF from the media library.
  z.object({ kind: z.literal('picture'), id: z.uuid() }).strict(),
]);
export type OwnReaction = z.infer<typeof OwnReactionSchema>;

/** Sounds made by the browser itself (no files), so every game has a soundboard to start from. */
export const BUILTIN_SOUNDS = ['fanfare', 'tada', 'ding', 'airhorn', 'drumroll', 'boing', 'sad-trombone', 'applause'] as const;
export type BuiltinSound = typeof BUILTIN_SOUNDS[number];
export const MAX_SOUNDS = 12;
/** The longest a sound plays (a longer song from the library is cut off). */
export const SOUND_MAX_SECONDS = 6;
/** A player waits this long between two sounds; the room plays at most one sound at a time. */
export const SOUND_COOLDOWN_SECONDS = 20;
export const SoundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), name: z.enum(BUILTIN_SOUNDS) }).strict(),
  // A song from the media library, with the name on its button.
  z.object({ kind: z.literal('media'), id: z.uuid(), label: z.string().trim().min(1).max(24) }).strict(),
]);
export type Sound = z.infer<typeof SoundSchema>;
/** The soundboard when a game sets none: four of the built-in sounds. */
export const DEFAULT_SOUNDBOARD: Sound[] = (['fanfare', 'airhorn', 'drumroll', 'sad-trombone'] as const).map(name => ({ kind: 'builtin', name }));

/** A player plays sound number `sound` of the game's soundboard. */
export const SoundRequestSchema = z.object({ sound: z.number().int().min(0).max(MAX_SOUNDS - 1) }).strict();
/** What the room's screens get: the game's own reactions and its soundboard (public: no secrets in them). */
export const PartyExtrasSchema = z.object({ reactions: z.array(OwnReactionSchema).max(MAX_OWN_REACTIONS), sounds: z.array(SoundSchema).max(MAX_SOUNDS) }).strict();
export type PartyExtras = z.infer<typeof PartyExtrasSchema>;

import { z } from 'zod';

/**
 * Pictures, videos and songs authors put in their games (the media library): uploaded once by the
 * owner or an editor, then used by any scene. A scene shows one of them with its question or text.
 * Pictures show on the shared screen and the phones; videos and songs play on the shared screen only
 * (on the host's screen when no shared screen is connected), so one room never plays sound twice.
 */
export const SCENE_MEDIA_KINDS = ['image', 'video', 'audio'] as const;
export const SceneMediaKindSchema = z.enum(SCENE_MEDIA_KINDS);
export type SceneMediaKind = z.infer<typeof SceneMediaKindSchema>;
/** A scene's media in a game definition: which library item, and what it is. */
export const SceneMediaSchema = z.object({ id: z.uuid(), kind: SceneMediaKindSchema }).strict();
export type SceneMedia = z.infer<typeof SceneMediaSchema>;
/** The same in a room: where the screens fetch it. */
export const PublicSceneMediaSchema = z.object({ id: z.uuid(), kind: SceneMediaKindSchema, url: z.string().regex(/^\/api\/media\/[0-9a-f-]{36}$/) }).strict();
export type PublicSceneMedia = z.infer<typeof PublicSceneMediaSchema>;
export const sceneMediaUrl = (id: string) => `/api/media/${id}`;

/** Upload limits per kind, and for the whole library (the Pi's disk). Regular uploads are served as uploaded. */
export const LIBRARY_LIMITS = { image: 10 * 1024 * 1024, video: 80 * 1024 * 1024, audio: 25 * 1024 * 1024, total: 4 * 1024 * 1024 * 1024 } as const;
export const LIBRARY_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/wav,audio/x-wav,audio/flac,.mp3,.m4a,.ogg,.wav,.flac';
export const LibraryItemSchema = z.object({
  id: z.uuid(), kind: SceneMediaKindSchema, name: z.string().max(120), credit: z.string().max(300).nullable(), contentType: z.string(), byteSize: z.number().int().min(0), createdAt: z.string(),
}).strict();
/** Renaming a library file or setting its credit (composer and licence; empty: none). */
export const UpdateLibraryItemSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), credit: z.string().trim().max(300).optional() }).strict()
  .refine(value => value.name !== undefined || value.credit !== undefined, 'Nothing to change');
export type LibraryItem = z.infer<typeof LibraryItemSchema>;
export const MediaLibrarySchema = z.object({ items: z.array(LibraryItemSchema), usedBytes: z.number().int().min(0), limitBytes: z.number().int().min(0) }).strict();
export type MediaLibrary = z.infer<typeof MediaLibrarySchema>;

export const MAX_AUDIO_CLIP_SECONDS = 20 * 60;
export const ImportYouTubeAudioSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  name: z.string().trim().min(1).max(120),
  permission: z.literal(true).optional(), // Accepted for editors that still have the previous build open.
}).strict();
export const TrimAudioSchema = z.object({
  start: z.number().min(0).max(24 * 60 * 60),
  end: z.number().positive().max(24 * 60 * 60),
  name: z.string().trim().min(1).max(120),
}).strict().refine(({ start, end }) => {
  const lengthMs = Math.round(end * 1000) - Math.round(start * 1000);
  return lengthMs >= 100 && lengthMs <= MAX_AUDIO_CLIP_SECONDS * 1000;
});

/**
 * Music (songs from the media library). A game's background playlist plays from the lobby on, one song after the
 * other and round again. A scene can keep it, play its own song (on repeat) instead, play it quieter, or be silent.
 * Like scene media it plays on the shared screen only (or the host's screen without one); a question's own video or
 * song makes the music quieter while that scene is on. The host can switch music off and set its volume in the room.
 */
const AudioRefSchema = z.object({ id: z.uuid(), kind: z.literal('audio') }).strict();
export const GameMusicSchema = z.object({ tracks: z.array(AudioRefSchema).min(1).max(30) }).strict();
export type GameMusic = z.infer<typeof GameMusicSchema>;
export const SCENE_MUSIC_MODES = ['keep', 'play', 'quiet', 'stop'] as const;
export const SceneMusicSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('keep') }).strict(),
  z.object({ mode: z.literal('play'), track: AudioRefSchema }).strict(),
  z.object({ mode: z.literal('quiet') }).strict(),
  z.object({ mode: z.literal('stop') }).strict(),
]);
export type SceneMusic = z.infer<typeof SceneMusicSchema>;
// `title` and `credit` show on the shared screen when the song starts (a CC BY song must be credited).
const PublicAudioSchema = z.object({ id: z.uuid(), url: z.string().regex(/^\/api\/media\/[0-9a-f-]{36}$/), title: z.string().max(120), credit: z.string().max(300).nullable() }).strict();
/** What the room's music player needs: the playlist, and what the current scene does with it. */
export const PublicMusicSchema = z.object({
  playlist: z.array(PublicAudioSchema),
  scene: z.object({ mode: z.enum(SCENE_MUSIC_MODES), track: PublicAudioSchema.nullable() }).strict(),
  // The scene has its own video or song: the music plays quieter under it.
  duck: z.boolean(),
}).strict();
export type PublicMusic = z.infer<typeof PublicMusicSchema>;
export const MUSIC_VOLUME_DEFAULT = 60;

/**
 * The standard songs: free music the owner chose, put in the library by `npm run music:defaults` (downloaded from
 * the source, checked against `sha256`, never kept in the repository). Fixed ids, so the editor can offer them as
 * the standard playlist. CC BY songs carry their credit, shown whenever they play.
 */
export interface DefaultSong { id: string; title: string; credit: string | null; url: string; sha256: string; byteSize: number; zipEntry?: string; use: 'playlist' | 'scene' }
const MACLEOD = (title: string) => `“${title}” Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0 (creativecommons.org/licenses/by/4.0)`;
const INCOMPETECH = (title: string) => `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(title)}.mp3`;
export const DEFAULT_SONGS: readonly DefaultSong[] = [
  { id: '5e0c7c6a-0d3b-4a51-9f61-6b1d0c1a0001', title: 'Hotrock', credit: MACLEOD('Hotrock'), url: INCOMPETECH('Hotrock'), sha256: '6cf9c8ae5270aab7793981d9dd834e18388cd3651cc0767aa7f63363d1641325', byteSize: 8329702, use: 'playlist' },
  { id: '5e0c7c6a-0d3b-4a51-9f61-6b1d0c1a0002', title: 'At Launch', credit: MACLEOD('At Launch'), url: INCOMPETECH('At Launch'), sha256: '52215f8ad85bfbced05752052adadd58bffa5caef16696f6cea4d9d49a647a8e', byteSize: 7533048, use: 'playlist' },
  { id: '5e0c7c6a-0d3b-4a51-9f61-6b1d0c1a0003', title: 'The Show Must Be Go', credit: MACLEOD('The Show Must Be Go'), url: INCOMPETECH('The Show Must Be Go'), sha256: '2c9d78a555ea3f897a1529c819da442a9ea479b29704a3e5b8ed4a3ee3245cc5', byteSize: 6916164, use: 'playlist' },
  // Public domain (CC0) by Gichco (“obscure music” on OpenGameArt); credit is optional, given anyway.
  { id: '5e0c7c6a-0d3b-4a51-9f61-6b1d0c1a0004', title: 'Loop 3', credit: 'Loop 3 by Gichco (opengameart.org), public domain (CC0)', url: 'https://opengameart.org/sites/default/files/loops_1.zip', sha256: '35031eaa66f48f5e63568a8d48e658697e197462d48d0945d80035c10f1cd88b', byteSize: 3656088, zipEntry: 'loop3.mp3', use: 'playlist' },
];

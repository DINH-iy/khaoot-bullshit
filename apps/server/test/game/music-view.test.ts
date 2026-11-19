import { describe, expect, it } from 'vitest';
import { musicView } from '../../src/game/views.js';

const a = '1c6f3f6e-9d2a-4f3c-8a1e-2c4d6e8f0a1b'; const b = '2d7f3f6e-9d2a-4f3c-8a1e-2c4d6e8f0a1b'; const own = '3e8f3f6e-9d2a-4f3c-8a1e-2c4d6e8f0a1b';
const playlist = { music: { tracks: [{ id: a }, { id: b }] } };
// What the library knows: titles and credits (a song that was removed is simply not here).
const library = new Map([[a, { title: 'Hotrock', credit: '“Hotrock” Kevin MacLeod (incompetech.com), CC BY 4.0' }], [b, { title: 'Loop 3', credit: null }], [own, { title: 'The Question Is', credit: 'Sascha Ende' }]]);
const song = (id: string) => ({ id, url: `/api/media/${id}`, title: library.get(id)!.title, credit: library.get(id)!.credit });

describe('the music a room plays', () => {
  it('is nothing at all for a game without music', () => {
    expect(musicView({}, null, library)).toBeNull();
    expect(musicView({}, { music: { mode: 'quiet' } }, library)).toBeNull();
  });
  it('is the playlist, with titles and credits, in the lobby and in scenes that keep it', () => {
    expect(musicView(playlist, null, library)).toEqual({ playlist: [song(a), song(b)], scene: { mode: 'keep', track: null }, duck: false });
    expect(musicView(playlist, {}, library)?.scene).toEqual({ mode: 'keep', track: null });
  });
  it('follows the scene: its own song (even without a playlist), quieter, or silence', () => {
    expect(musicView({}, { music: { mode: 'play', track: { id: own, kind: 'audio' } } }, library)).toEqual({ playlist: [], scene: { mode: 'play', track: song(own) }, duck: false });
    expect(musicView(playlist, { music: { mode: 'quiet' } }, library)?.scene.mode).toBe('quiet');
    expect(musicView(playlist, { music: { mode: 'stop' } }, library)?.scene.mode).toBe('stop');
  });
  it('leaves out songs no longer in the library, and keeps the playlist when a scene’s own song is gone', () => {
    const without = new Map([...library].filter(([id]) => id !== a && id !== own));
    expect(musicView(playlist, null, without)?.playlist).toEqual([song(b)]);
    expect(musicView(playlist, { music: { mode: 'play', track: { id: own, kind: 'audio' } } }, without)?.scene).toEqual({ mode: 'keep', track: null });
    expect(musicView({ music: { tracks: [{ id: a }] } }, null, new Map())).toBeNull();
  });
  it('plays quieter under a scene’s own video or song, not under a picture', () => {
    expect(musicView(playlist, { media: { id: own, kind: 'audio' } }, library)?.duck).toBe(true);
    expect(musicView(playlist, { media: { id: own, kind: 'video' } }, library)?.duck).toBe(true);
    expect(musicView(playlist, { media: { id: own, kind: 'image' } }, library)?.duck).toBe(false);
  });
});

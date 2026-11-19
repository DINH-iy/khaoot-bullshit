import { useEffect, useState } from 'react';
import { DEFAULT_SONGS, MediaLibrarySchema, sceneMediaUrl, type LibraryItem } from '@party/contracts';
import { roomApi } from '../../../room/api.js';
import { Segmented } from '../../controls/segmented.js';
import { Icon } from '../../controls/icons.js';
import type { Definition, Stage } from '../../model.js';
import { MediaLibraryDialog } from './media-field.js';

// Music (contracts/media.ts): the game's background playlist (Game settings) and what each scene does with it.
type Track = { id: string; kind: 'audio' };
const MODES = [
  { value: 'keep', label: 'Keep the music', hint: 'The game’s background music plays on.' },
  { value: 'play', label: 'Its own song', hint: 'A song of its own, on repeat, while this scene is on.' },
  { value: 'quiet', label: 'Quieter', hint: 'The background music plays softly.' },
  { value: 'stop', label: 'Silence', hint: 'No music during this scene.' },
] as const;
type Mode = typeof MODES[number]['value'];
export const musicSummary = (stage: Stage) => ({ keep: 'Background music', play: 'Its own song', quiet: 'Music quieter', stop: 'Silence' })[((stage['music'] as { mode?: Mode } | undefined)?.mode ?? 'keep')];

/** The library's songs by id, for their names. */
function useSongNames(ids: string[]) {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = ids.join(',');
  useEffect(() => { if (!ids.length) return; void roomApi('/api/host/media').then(data => setNames(Object.fromEntries(MediaLibrarySchema.parse(data).items.map(item => [item.id, item.name])))).catch(() => undefined); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (id: string) => names[id] ?? (Object.keys(names).length ? 'No longer in the library' : '…');
}

/** Game settings → Music: the background playlist, in play order. */
export function GameMusicFields({ definition, onChange }: { definition: Definition; onChange: (next: Definition, group?: string) => void }) {
  const tracks = ((definition['music'] as { tracks?: Track[] } | undefined)?.tracks ?? []);
  const [adding, setAdding] = useState(false); const name = useSongNames(tracks.map(track => track.id));
  const set = (next: Track[]) => { const copy = { ...definition }; if (next.length) copy['music'] = { tracks: next }; else delete copy['music']; onChange(copy, 'music'); };
  const [note, setNote] = useState('');
  // The standard songs (DEFAULT_SONGS) that this server's library has: put on the server by `npm run music:defaults`.
  const addStandard = () => { setNote(''); void roomApi('/api/host/media').then(data => {
    const there = new Set(MediaLibrarySchema.parse(data).items.map(item => item.id));
    const standard = DEFAULT_SONGS.filter(song => song.use === 'playlist' && there.has(song.id) && !tracks.some(track => track.id === song.id));
    if (standard.length) set([...tracks, ...standard.map(song => ({ id: song.id, kind: 'audio' as const }))]);
    setNote(standard.length ? `${standard.length} standard ${standard.length === 1 ? 'song' : 'songs'} added.` : DEFAULT_SONGS.some(song => there.has(song.id)) ? 'The standard songs are on the playlist already.' : 'This server has no standard songs yet: run “npm run music:defaults” on it once.');
  }).catch(() => setNote('The library could not be loaded.')); };
  const move = (from: number, to: number) => { const next = [...tracks]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved!); set(next); };
  return <div className="music-fields">
    <p className="hint">Plays on the shared screen from the lobby on, one song after the other and round again. Each scene can keep it, play its own song, play it quieter or be silent (the scene’s Music group). The host can switch it off or turn it down in the room.</p>
    {tracks.length > 0 && <ol className="music-list">{tracks.map((track, position) => <li key={`${track.id}-${position}`}>
      <span className="music-name" title={name(track.id)}>{name(track.id)}</span>
      <audio src={sceneMediaUrl(track.id)} controls preload="none" aria-label={`Listen to ${name(track.id)}`} />
      <button type="button" className="icon-only" aria-label={`Move ${name(track.id)} up`} disabled={position === 0} onClick={() => move(position, position - 1)}><span aria-hidden="true">↑</span></button>
      <button type="button" className="icon-only" aria-label={`Take ${name(track.id)} off the playlist`} onClick={() => set(tracks.filter((_, index) => index !== position))}><Icon name="trash" size={14} /></button>
    </li>)}</ol>}
    <div className="actions">
      <button type="button" className="small-button with-icon" disabled={tracks.length >= 30} onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add a song</button>
      <button type="button" className="small-button" onClick={addStandard}>Use the standard songs</button></div>
    {note && <p className="hint" role="status">{note}</p>}
    {adding && <MediaLibraryDialog current={undefined} only="audio" title="Add a song" onPick={(item: LibraryItem) => { set([...tracks, { id: item.id, kind: 'audio' }]); setAdding(false); }} onClose={() => setAdding(false)} />}
  </div>;
}

/** A scene's Music group: keep the background music, its own song, quieter, or silence. */
export function SceneMusicFields({ stage, onChange }: { stage: Stage; onChange: (next: Stage) => void }) {
  const music = stage['music'] as { mode: Mode; track?: Track } | undefined; const mode = music?.mode ?? 'keep';
  const [choosing, setChoosing] = useState(false); const name = useSongNames(music?.track ? [music.track.id] : []);
  const set = (next: { mode: Mode; track?: Track } | null) => { const copy: Stage = { ...stage }; if (next && next.mode !== 'keep') copy['music'] = next; else delete copy['music']; onChange(copy); };
  return <div className="music-fields">
    <Segmented label="Music during this scene" stacked value={mode} choices={MODES} onChange={next => { if (next === 'play') { if (music?.track) set({ mode: 'play', track: music.track }); else setChoosing(true); } else set({ mode: next }); }} />
    {mode === 'play' && music?.track && <div className="music-own"><span className="music-name">{name(music.track.id)}</span>
      <audio src={sceneMediaUrl(music.track.id)} controls preload="none" aria-label={`Listen to ${name(music.track.id)}`} />
      <button type="button" className="small-button" onClick={() => setChoosing(true)}>Change song…</button></div>}
    {choosing && <MediaLibraryDialog current={music?.track?.id} only="audio" title="Song for this scene" onPick={item => { set({ mode: 'play', track: { id: item.id, kind: 'audio' } }); setChoosing(false); }} onClose={() => setChoosing(false)} />}
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import type { PublicMusic } from '@party/contracts';
import { FaIcon } from '../presentation/icons.js';

// How much quieter the music plays: when the scene asks for it, and under a question's own video or song.
const QUIET = 0.3; const UNDER_MEDIA = 0.15;
// How long “now playing” (title and credit) shows when a song starts.
const CAPTION_MS = 8000;

/**
 * The room's music (contracts/media.ts), on the one screen that plays sound (the shared screen, or the host's
 * screen without one). The playlist plays song after song and round again; a scene's own song repeats while that
 * scene is on, and the playlist then continues where it was. Browsers may block sound until someone taps the page:
 * then a button starts it.
 */
export function MusicPlayer({ music, volume }: { music: PublicMusic; volume: number }) {
  const audio = useRef<HTMLAudioElement>(null); const [index, setIndex] = useState(0); const [blocked, setBlocked] = useState(false);
  const [caption, setCaption] = useState<{ title: string; credit: string | null } | null>(null);
  // Where the playlist was when a scene's own song (or silence) took over.
  const resume = useRef<{ url: string; time: number } | null>(null);
  const { mode, track } = music.scene; const playlist = music.playlist;
  const own = mode === 'play' && track ? track : null;
  const target = mode === 'stop' ? null : own ?? (playlist.length ? playlist[index % playlist.length]! : null);
  const level = Math.max(0, Math.min(1, volume * (mode === 'quiet' ? QUIET : 1) * (music.duck ? UNDER_MEDIA : 1)));

  const start = () => { void audio.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); };
  // Each song that starts is named, with its credit (a CC BY song must be credited where it plays).
  useEffect(() => { if (!target || blocked) { setCaption(null); return; } setCaption({ title: target.title, credit: target.credit }); const timer = setTimeout(() => setCaption(null), CAPTION_MS); return () => clearTimeout(timer); }, [target?.url, blocked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const element = audio.current; if (!element) return;
    const playing = element.dataset['src'];
    // Leaving a playlist song: remember the spot, to go on from there afterwards.
    if (playing && playing !== target?.url && playlist.some(entry => entry.url === playing)) resume.current = { url: playing, time: element.currentTime };
    if (!target) { element.pause(); return; }
    if (playing !== target.url) {
      element.src = target.url; element.dataset['src'] = target.url;
      if (resume.current?.url === target.url) { const time = resume.current.time; element.addEventListener('loadedmetadata', () => { element.currentTime = time; }, { once: true }); resume.current = null; }
    }
    // A scene's own song, or a playlist of one, repeats.
    element.loop = Boolean(own) || playlist.length === 1;
    start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.url]);
  useEffect(() => { if (audio.current) audio.current.volume = level; }, [level]);
  useEffect(() => () => { audio.current?.pause(); }, []);

  return <>
    {/* A song that cannot be loaded (removed, network) is skipped; a scene's own song then waits silently. */}
    <audio ref={audio} preload="auto" aria-hidden="true" onEnded={() => { if (!own) setIndex(value => value + 1); }} onError={() => { if (!own && playlist.length > 1) setIndex(value => value + 1); }} />
    {caption && <p className="music-caption" role="status"><span aria-hidden="true">♪</span> <strong>{caption.title}</strong>{caption.credit ? <span className="music-credit"> · {caption.credit}</span> : null}</p>}
    {blocked && target && <button type="button" className="primary music-start" onClick={start}><FaIcon name="play" /> Start the music</button>}
  </>;
}

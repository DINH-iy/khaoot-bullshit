import { useEffect, useRef, useState } from 'react';
import type { PublicMusic } from '@party/contracts';
import { useTexts } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from './extras.text.js';
import { FaIcon } from '../presentation/icons.js';

const QUIET = 0.3;
const UNDER_MEDIA = 0.15;
const CAPTION_MS = 8000;

export function MusicPlayer({ music, volume }: { music: PublicMusic; volume: number }) {
  const t = useTexts(EXTRAS_TEXTS);
  const audio = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [caption, setCaption] = useState(false);
  const failures = useRef(0);
  const playbackAttempt = useRef(0);
  const current = useRef<{ key: string; background: boolean } | null>(null);
  const resume = useRef<{ key: string; time: number } | null>(null);
  const { mode, track } = music.scene;
  const { playlist } = music;
  const own = mode === 'play' && track ? track : null;
  const target = mode === 'stop' ? null : own ?? playlist[index % playlist.length] ?? null;
  const url = target?.url;
  const key = target ? (own ? `scene:${target.id}` : `playlist:${index}:${target.id}`) : null;
  const loop = Boolean(own) || playlist.length === 1;
  const level = Math.max(0, Math.min(1, volume * (mode === 'quiet' ? QUIET : 1) * (music.duck ? UNDER_MEDIA : 1)));

  function start(element: HTMLAudioElement) {
    const attempt = ++playbackAttempt.current;
    void element.play().then(() => {
      if (playbackAttempt.current !== attempt) return;
      failures.current = 0;
      setBlocked(false);
    }).catch((error: unknown) => {
      if (playbackAttempt.current === attempt && error instanceof DOMException && error.name === 'NotAllowedError') setBlocked(true);
    });
  }

  useEffect(() => {
    if (!key || blocked) { setCaption(false); return; }
    setCaption(true);
    const timer = setTimeout(() => setCaption(false), CAPTION_MS);
    return () => clearTimeout(timer);
  }, [key, blocked]);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const previous = current.current;
    if (previous?.background && previous.key !== key && !element.ended && Number.isFinite(element.currentTime)) {
      resume.current = { key: previous.key, time: element.currentTime };
    }
    if (!key || !url) {
      element.pause();
      current.current = null;
      return;
    }

    const savedTime = resume.current?.key === key ? resume.current.time : 0;
    const restore = () => { element.currentTime = Math.min(savedTime, element.duration || savedTime); };
    current.current = { key, background: !own };
    if (element.getAttribute('src') === url) element.load();
    else element.src = url;
    if (savedTime > 0) element.addEventListener('loadedmetadata', restore, { once: true });
    if (!own) resume.current = null;
    start(element);
    return () => {
      playbackAttempt.current++;
      element.removeEventListener('loadedmetadata', restore);
      element.pause();
    };
  }, [key, url, own?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (audio.current) audio.current.volume = level; }, [level]);

  return <>
    <audio ref={audio} loop={loop} preload="auto" aria-hidden="true"
      onEnded={() => { if (key && !loop) setIndex(value => value + 1); }}
      onError={() => {
        // Try each playlist entry at most once until a song actually plays.
        if (key && !loop && ++failures.current < playlist.length) setIndex(value => value + 1);
      }} />
    {caption && target && <p className="music-caption" role="status"><span aria-hidden="true">♪</span> <strong>{target.title}</strong>{target.credit ? <span className="music-credit"> · {target.credit}</span> : null}</p>}
    {blocked && target && <button type="button" className="primary music-start" onClick={() => { if (audio.current) start(audio.current); }}><FaIcon name="play" /> {t('startMusic')}</button>}
  </>;
}

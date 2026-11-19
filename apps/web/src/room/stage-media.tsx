import { useEffect, useRef, useState } from 'react';
import type { PublicSceneMedia } from '@party/contracts';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from './extras.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import { FaIcon } from '../presentation/icons.js';

/**
 * A scene's picture, video or song (contracts/media.ts). Pictures show everywhere. A video or song plays
 * in one place only, so a room never hears it twice: the shared screen, or the host's screen when no
 * shared screen is connected. Phones are told to watch or listen. Browsers may block sound until someone
 * taps the page; then a Play button appears.
 */
export function StageMedia({ media, role, displayConnected, label }: { media: PublicSceneMedia; role: 'host' | 'player' | 'display'; displayConnected: boolean; label: string }) {
  const plays = role === 'display' || (role === 'host' && !displayConnected);
  if (media.kind === 'image') return <figure className="stage-media image"><img src={media.url} alt={x('picture', { label })} /></figure>;
  if (!plays) return <p className="stage-media note"><FaIcon name="tv" /> {role === 'player'
    ? x(media.kind === 'video' ? 'watchScreen' : 'listenScreen')
    : x(media.kind === 'video' ? 'videoScreen' : 'songScreen')}</p>;
  return <Player key={media.id} media={media} label={label} />;
}

function Player({ media, label }: { media: PublicSceneMedia; label: string }) {
  const element = useRef<HTMLVideoElement & HTMLAudioElement>(null); const [blocked, setBlocked] = useState(false);
  const play = () => { void element.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); };
  // Starts by itself when the scene appears; a browser that wants a tap first gets the Play button.
  useEffect(() => { play(); }, []);
  return <figure className={`stage-media ${media.kind}`}>
    {media.kind === 'video'
      ? <video ref={element} src={media.url} controls playsInline preload="auto" aria-label={x('video', { label })} />
      : <><span className="stage-media-art" aria-hidden="true"><FaIcon name="play" /></span><audio ref={element} src={media.url} controls preload="auto" aria-label={x('song', { label })} /></>}
    {blocked && <button type="button" className="primary stage-media-play" onClick={play}><FaIcon name="play" /> {x(media.kind === 'video' ? 'playVideo' : 'playSong')}</button>}
  </figure>;
}

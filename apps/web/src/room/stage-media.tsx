import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CROP_RATIOS, youtubeWatchUrl, type MediaControl, type PublicSceneMedia, type YouTubeClip } from '@party/contracts';
import { MEDIA_CONTROL_TEXTS } from './media-control.text.js';
import { useTexts } from '../i18n/texts.js';
import { YOUTUBE_TEXTS } from '../presentation/youtube.text.js';
import { EXTRAS_TEXTS } from './extras.text.js';
import { FaIcon } from '../presentation/icons.js';
import { AudioWaveform } from './audio-waveform.js';
import { formatRemaining } from './stage-timer.js';

type Role = 'host' | 'player' | 'display';
/** The host's latest play, pause or restart for this screen's media (from the room connection). */
export type MediaCommand = (MediaControl & { id: number }) | null;
const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
const canPlayHere = (role: Role, displayConnected: boolean) => role === 'display' || (role === 'host' && !displayConnected);

function MediaNote({ role, song = false }: { role: Role; song?: boolean }) {
  const t = useTexts(EXTRAS_TEXTS);
  return <p className="stage-media note"><FaIcon name="tv" /> {t(song
    ? role === 'player' ? 'listenScreen' : 'songScreen'
    : role === 'player' ? 'watchScreen' : 'videoScreen')}</p>;
}

export function StageYouTube({ clip, role, displayConnected, label, paused = false, preview = false, control = null }: {
  clip: YouTubeClip; role: Role; displayConnected: boolean; label: string; paused?: boolean; preview?: boolean; control?: MediaCommand;
}) {
  const t = useTexts(YOUTUBE_TEXTS);
  const x = useTexts(EXTRAS_TEXTS);
  const [opened, setOpened] = useState(false);
  if (!canPlayHere(role, displayConnected)) return <MediaNote role={role} />;
  return <figure className="stage-media youtube">
    {preview && !opened
      ? <button type="button" className="primary" onClick={() => setOpened(true)}><FaIcon name="play" /> {x('playVideo')}</button>
      : <YouTubeFrame clip={clip} title={`${t('title')} · ${label}`} paused={paused} autoPlay={preview || !paused} preview={preview} control={control} />}
    <a className="hint" href={youtubeWatchUrl(clip.videoId, clip.startSeconds)} target="_blank" rel="noreferrer">{t('open')}</a>
  </figure>;
}

function YouTubeFrame({ clip, title, paused, autoPlay, preview, control }: {
  clip: YouTubeClip; title: string; paused: boolean; autoPlay: boolean; preview: boolean; control: MediaCommand;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Loading is tied to the clip. A change to room pause must never reload or rewind the iframe.
  const [startPlaying] = useState(autoPlay);
  const resume = useRef(false);
  const waitingToStart = useRef(!autoPlay);
  const pendingPlay = useRef(false);
  const playerState = useRef<number | undefined>(undefined);
  const post = (data: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(data), YOUTUBE_ORIGIN);
  const command = (func: 'pauseVideo' | 'playVideo') => post({ event: 'command', func, args: [] });
  useEffect(() => {
    if (preview) return;
    const message = (event: MessageEvent) => {
      if (event.origin !== YOUTUBE_ORIGIN || event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      let data: { event?: string; info?: { playerState?: number } } | null;
      try { data = JSON.parse(event.data); } catch { return; }
      const state = data?.info?.playerState;
      if (typeof state === 'number') playerState.current = state;
      if (state === 1) pendingPlay.current = false;
      if (paused && (data?.event === 'onReady' || state === 1 || state === 3)) command('pauseVideo');
      if (!paused && pendingPlay.current && (data?.event === 'onReady' || data?.event === 'initialDelivery')) command('playVideo');
    };
    window.addEventListener('message', message);
    if (paused) {
      pendingPlay.current = false;
      resume.current = waitingToStart.current || (playerState.current === undefined ? startPlaying : playerState.current === 1 || playerState.current === 3);
      command('pauseVideo');
    } else if (resume.current) {
      resume.current = false;
      waitingToStart.current = false;
      pendingPlay.current = true;
      command('playVideo');
    }
    return () => window.removeEventListener('message', message);
  }, [paused, preview, startPlaying]);
  // The host's play, pause or restart (never while the room is paused).
  const handled = useRef(0);
  useEffect(() => {
    if (!control || control.id <= handled.current || preview) return;
    handled.current = control.id;
    if (control.action === 'pause' || paused) { command('pauseVideo'); return; }
    if (control.action === 'restart') post({ event: 'command', func: 'seekTo', args: [clip.startSeconds ?? 0, true] });
    command('playVideo');
  }, [control?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = new URLSearchParams({ autoplay: startPlaying ? '1' : '0', playsinline: '1' });
  if (clip.startSeconds) params.set('start', String(clip.startSeconds));
  if (clip.endSeconds !== undefined) params.set('end', String(clip.endSeconds));
  if (!preview) { params.set('enablejsapi', '1'); params.set('origin', location.origin); }
  return <iframe ref={frame} src={`${YOUTUBE_ORIGIN}/embed/${clip.videoId}?${params}`}
    title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
    referrerPolicy="strict-origin-when-cross-origin" onLoad={() => {
      if (!preview) { post({ event: 'listening' }); if (paused) command('pauseVideo'); }
    }} />;
}

/** Only the shared display (or the host alone) plays sound. The room pause also pauses that screen's media. */
export function StageMedia({ media, role, displayConnected, label, paused = false, preview = false, control = null }: {
  media: PublicSceneMedia; role: Role; displayConnected: boolean; label: string; paused?: boolean; preview?: boolean; control?: MediaCommand;
}) {
  const t = useTexts(EXTRAS_TEXTS);
  if (media.kind === 'image') {
    const crop = media.crop;
    const style = crop ? { '--media-crop-ratio': CROP_RATIOS[crop.ratio], '--media-crop-position': `${crop.x}% ${crop.y}%` } as CSSProperties : undefined;
    return <><figure className={`stage-media image${crop ? ' cropped' : ''}`} style={style}><img src={media.url} alt={media.alt ?? t('picture', { label })} /></figure>
      {media.caption && <p className="stage-media-caption">{media.caption}</p>}</>;
  }
  // The caption shows on every screen, also on phones where the video or song plays on the shared screen.
  if (!canPlayHere(role, displayConnected)) return <>{<MediaNote role={role} song={media.kind === 'audio'} />}{media.caption && <p className="stage-media-caption">{media.caption}</p>}</>;
  return <><Player key={media.id} media={media} label={label} paused={paused} preview={preview} control={control} />{media.caption && <p className="stage-media-caption">{media.caption}</p>}</>;
}

function Player({ media, label, paused, preview, control }: { media: PublicSceneMedia; label: string; paused: boolean; preview: boolean; control: MediaCommand }) {
  const t = useTexts(EXTRAS_TEXTS);
  const element = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const started = useRef(false);
  const resume = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [audio, setAudio] = useState({ duration: 0, time: 0, playing: false, volume: 1 });
  const play = () => { void element.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); };
  useEffect(() => {
    const player = element.current;
    if (!player || preview) return;
    if (paused) {
      resume.current = !player.paused;
      player.pause();
    } else if (!started.current || resume.current) {
      started.current = true;
      resume.current = false;
      play();
    }
  }, [paused, preview]);
  const start = media.trim?.startSeconds ?? 0;
  const end = media.trim?.endSeconds;
  // The host's play, pause or restart (never while the room is paused).
  const handled = useRef(0);
  useEffect(() => {
    const player = element.current;
    if (!control || control.id <= handled.current || !player || preview) return;
    handled.current = control.id;
    if (control.action === 'pause' || paused) { player.pause(); return; }
    if (control.action === 'restart') player.currentTime = start;
    started.current = true; play();
  }, [control?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const readAudio = () => {
    const player = element.current;
    if (!player) return;
    setAudio({ duration: Number.isFinite(player.duration) ? player.duration : 0, time: player.currentTime, playing: !player.paused, volume: player.volume });
  };
  const seekToStart = () => {
    const player = element.current;
    if (player && player.currentTime < start) player.currentTime = Math.min(player.duration || start, start);
  };
  const hold = () => {
    const player = element.current;
    if (!player) return;
    if (paused) { player.pause(); return; }
    if (end !== undefined && player.currentTime >= end) player.currentTime = start;
    seekToStart();
  };
  const stopAtEnd = () => {
    const player = element.current;
    if (player && end !== undefined && player.currentTime >= end) {
      player.pause();
      if (player.currentTime > end) player.currentTime = end;
    }
  };
  const clipEvents = media.trim ? { onLoadedMetadata: seekToStart, onSeeking: seekToStart, onTimeUpdate: stopAtEnd } : {};
  const endAt = Math.min(audio.duration, end ?? audio.duration);
  const clipLength = Math.max(0, endAt - start);
  const elapsed = Math.min(clipLength, Math.max(0, audio.time - start));
  const toggle = () => { if (element.current?.paused) play(); else element.current?.pause(); };
  return <figure className={`stage-media ${media.kind}`}>
    {media.kind === 'video'
      ? <video ref={element} src={media.url} controls playsInline preload={preview ? 'metadata' : 'auto'} onPlay={hold} {...clipEvents} aria-label={t('video', { label })} />
      : <div className="scene-audio-player" role="group" aria-label={t('song', { label })}>
        <audio ref={element} src={media.url} hidden preload={preview ? 'metadata' : 'auto'}
          onLoadedMetadata={() => { seekToStart(); readAudio(); }}
          onPlay={() => { hold(); readAudio(); }} onPlaying={readAudio} onPause={readAudio} onEnded={readAudio}
          onSeeking={seekToStart} onSeeked={readAudio} onVolumeChange={readAudio}
          onTimeUpdate={() => { stopAtEnd(); readAudio(); }} />
        {media.waveform !== false && <AudioWaveform url={media.url} duration={audio.duration} currentTime={audio.time} start={start} end={end} />}
        <div className="scene-audio-transport">
          <button type="button" className="scene-audio-toggle" onClick={toggle} disabled={paused} aria-label={t(audio.playing ? 'pauseSong' : 'playSong')}>
            <FaIcon name={audio.playing ? 'pause' : 'play'} />
          </button>
          <div className="scene-audio-timeline">
            <input type="range" aria-label={t('seekSong')} aria-valuetext={formatRemaining(elapsed * 1000)} min={0} max={clipLength} step={.01} value={elapsed}
              disabled={clipLength === 0} onChange={event => { if (element.current) { element.current.currentTime = start + Number(event.target.value); readAudio(); } }} />
            <span className="scene-audio-time">{formatRemaining(elapsed * 1000)} / {formatRemaining(clipLength * 1000)}</span>
          </div>
        </div>
        <label className="scene-audio-volume"><span>{t('songVolume')}</span><input type="range" min={0} max={1} step={.02} value={audio.volume}
          onChange={event => { if (element.current) element.current.volume = Number(event.target.value); }} /></label>
      </div>}
    {media.kind === 'video' && blocked && !paused && <button type="button" className="primary stage-media-play" onClick={play}><FaIcon name="play" /> {t('playVideo')}</button>}
  </figure>;
}

/** The host's buttons for the video, song or clip playing on the shared screen. */
export function MediaHostControls({ onControl }: { onControl: (action: MediaControl['action']) => void }) {
  const c = useTexts(MEDIA_CONTROL_TEXTS);
  return <div className="media-host-controls" role="group" aria-label={c('controls')}>
    <span>{c('controls')}</span>
    <button type="button" aria-label={`${c('play')} · ${c('controls')}`} onClick={() => onControl('play')}><FaIcon name="play" /> {c('play')}</button>
    <button type="button" aria-label={`${c('pause')} · ${c('controls')}`} onClick={() => onControl('pause')}><FaIcon name="pause" /> {c('pause')}</button>
    <button type="button" aria-label={`${c('restart')} · ${c('controls')}`} onClick={() => onControl('restart')}><FaIcon name="arrow-rotate-left" /> {c('restart')}</button>
  </div>;
}

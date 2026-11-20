import { useEffect, useRef, useState } from 'react';
import { CLAP_BEATS_MS, CLAP_END_MS, clapBeatAt } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { listenToMicrophone, microphoneAvailable } from '../../room-extras/microphone-level.js';
import { useText } from '../../presentation/look.js';
import { useServerNow } from '../shared/clock.js';
import type { Result } from '../shared/countdown.js';
import './clap-beat.css';

const TEXTS = defineTexts('clap-beat', {
  enable: 'Use microphone', disable: 'Turn microphone off', requesting: 'Waiting for microphone permission…',
  failed: 'Microphone unavailable. You can still tap.', privacy: 'Audio stays on this device.',
  tap: 'Tap beat', ready: 'Wait for the beat', hit: 'Clap or tap now!', result: '{hits} of {total} beats',
}, {
  nl: { enable: 'Gebruik microfoon', disable: 'Zet microfoon uit', requesting: 'Wachten op microfoontoegang…', failed: 'Microfoon niet beschikbaar. Je kunt nog steeds tikken.', privacy: 'Audio blijft op dit apparaat.', tap: 'Tik op de maat', ready: 'Wacht op de maat', hit: 'Klap of tik nu!', result: '{hits} van {total} tellen' },
  de: { enable: 'Mikrofon verwenden', disable: 'Mikrofon ausschalten', requesting: 'Warte auf Mikrofonzugriff…', failed: 'Mikrofon nicht verfügbar. Du kannst weiterhin tippen.', privacy: 'Der Ton bleibt auf diesem Gerät.', tap: 'Im Takt tippen', ready: 'Warte auf den Takt', hit: 'Jetzt klatschen oder tippen!', result: '{hits} von {total} Takten' },
  ro: { enable: 'Folosește microfonul', disable: 'Oprește microfonul', requesting: 'Se așteaptă accesul la microfon…', failed: 'Microfon indisponibil. Poți atinge ecranul.', privacy: 'Sunetul rămâne pe acest dispozitiv.', tap: 'Atinge în ritm', ready: 'Așteaptă ritmul', hit: 'Bate din palme sau atinge acum!', result: '{hits} din {total} bătăi' },
});

export function ClapCue({ elapsed }: { elapsed: number }) {
  const t = useTexts(TEXTS);
  const game = useText();
  if (elapsed >= CLAP_END_MS) return <p role="status" className="clap-cue wait">{game('timer.up')}</p>;
  const active = clapBeatAt(elapsed) >= 0;
  return <p className={`clap-cue ${active ? 'go' : 'wait'}`} role="status">{t(active ? 'hit' : 'ready')}</p>;
}

export function ClapBeat({ startsAt, offset, disabled, onResult }: { startsAt: string; offset: number; disabled: boolean; onResult: (result: Result) => void }) {
  const t = useTexts(TEXTS);
  const tGame = useText();
  const start = Date.parse(startsAt);
  const elapsed = useServerNow(offset, true) - start;
  const over = elapsed >= CLAP_END_MS;
  const hits = useRef(new Set<number>());
  const [count, setCount] = useState(0);
  const [mic, setMic] = useState<'off' | 'asking' | 'on' | 'failed'>('off');
  const request = useRef<AbortController | null>(null);
  const sent = useRef(false);
  const latest = useRef({ disabled, start, offset });
  latest.current = { disabled, start, offset };
  const punch = () => {
    const current = latest.current;
    if (current.disabled || sent.current || document.hidden) return;
    const beat = clapBeatAt(Date.now() + current.offset - current.start);
    if (beat < 0 || hits.current.has(beat)) return;
    hits.current.add(beat); setCount(hits.current.size);
  };
  const stop = () => { request.current?.abort(); request.current = null; };
  useEffect(() => {
    const hide = () => { if (document.hidden) { stop(); setMic('off'); } };
    document.addEventListener('visibilitychange', hide);
    return () => { stop(); document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => {
    if (!over) return;
    stop();
    if (!sent.current && !disabled) { sent.current = true; onResult({ value: hits.current.size }); }
  }, [over, disabled, onResult]);

  const enable = () => {
    const controller = new AbortController();
    request.current = controller;
    setMic('asking');
    let noise = 0.008;
    let loud = false;
    let samples = 0;
    void listenToMicrophone(controller.signal, rms => {
      const threshold = Math.max(0.025, noise * 3.5);
      if (samples++ < 12) { noise += (rms - noise) * 0.2; return; }
      if (!loud && rms > threshold) { loud = true; punch(); }
      else if (loud && rms < threshold * 0.55) loud = false;
      if (!loud) noise += (rms - noise) * 0.035;
    }).then(() => { if (!controller.signal.aborted) setMic('on'); })
      .catch(() => { if (!controller.signal.aborted) { stop(); setMic('failed'); } });
  };
  const using = mic === 'on' || mic === 'asking';
  return <div className="clap-beat">
    {elapsed < 0 && <p role="timer">{tGame('timer.left', { time: Math.ceil(-elapsed / 1000) })}</p>}
    {!over && <ClapCue elapsed={elapsed} />}
    <p className="mg-sub">{t('result', { hits: count, total: CLAP_BEATS_MS.length })}</p>
    <button type="button" className="mg-pad" disabled={disabled || elapsed < 0 || over} onClick={punch}>{t('tap')}</button>
    {!over && microphoneAvailable() && <button type="button" onClick={() => { if (using) { stop(); setMic('off'); } else enable(); }}>{t(using ? 'disable' : 'enable')}</button>}
    <p className="hint">{mic === 'failed' ? t('failed') : mic === 'asking' ? t('requesting') : t('privacy')}</p>
  </div>;
}

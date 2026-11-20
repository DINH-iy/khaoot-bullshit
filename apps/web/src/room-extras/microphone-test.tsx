import { useEffect, useRef, useState } from 'react';
import { listenToMicrophone, microphoneAvailable } from './microphone-level.js';
import { useTexts } from '../i18n/texts.js';
import { PHONE_FEEDBACK_TEXTS } from './phone-feedback.text.js';

export function MicrophoneTest() {
  const t = useTexts(PHONE_FEEDBACK_TEXTS);
  const request = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<'idle' | 'asking' | 'listening' | 'error'>('idle');
  const [level, setLevel] = useState(0);

  const stop = () => { request.current?.abort(); request.current = null; };
  useEffect(() => {
    const hide = () => { if (document.hidden) { stop(); setStatus('idle'); } };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); stop(); };
  }, []);

  async function start() {
    const controller = new AbortController();
    request.current = controller;
    setStatus('asking');
    try {
      setLevel(0);
      await listenToMicrophone(controller.signal, rms => setLevel(Math.min(1, rms * 5)));
      if (!controller.signal.aborted) setStatus('listening');
    } catch {
      if (!controller.signal.aborted) { stop(); setStatus('error'); }
    }
  }

  if (!microphoneAvailable()) return <p className="hint">{t('micFailed')}</p>;
  const active = status === 'asking' || status === 'listening';
  return <section className="mic-test">
    <h3>{t('microphone')}</h3>
    <p className="hint">{t('micHint')}</p>
    {status === 'listening' && <meter min={0} max={1} value={level} aria-label={t('inputLevel')} />}
    {status === 'error' && <p role="status">{t('micFailed')}</p>}
    <button type="button" onClick={() => { if (!active) void start(); else { stop(); setStatus('idle'); } }}>{t(active ? 'micStop' : 'micStart')}</button>
  </section>;
}

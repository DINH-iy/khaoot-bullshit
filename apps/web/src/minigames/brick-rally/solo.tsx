import { useId, useLayoutEffect, useRef, useState } from 'react';
import { BRICK_MAX_SECONDS, BrickRaceSettingsSchema, brickMap, type BrickRaceSettings } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { BRICK_TEXTS } from './brick-rally.text.js';
import { BrickMapPreview, BrickRallyBoard } from './board.js';
import { BrickMapFields } from './map-fields.js';
import { BrickRaceRuleFields } from './rule-fields.js';

const storageKey = 'party-brick-rally-map';
function savedMap(): BrickRaceSettings {
  try { return BrickRaceSettingsSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? '{}')).data ?? {}; }
  catch { return {}; }
}

export function BrickRallySolo({ onClose }: { onClose: () => void }) {
  const t = useTexts(BRICK_TEXTS);
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState(savedMap);
  const [attempt, setAttempt] = useState(0);
  const map = brickMap(settings);
  const save = (next: BrickRaceSettings) => {
    setSettings(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Play without saving the choice. */ }
  };
  useLayoutEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); opener?.focus(); };
  }, []);
  return <dialog className="brick-solo" ref={dialog} aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="brick-solo-header"><h2 id={title}>Brick Rally</h2><button type="button" onClick={onClose}>{t('close')}</button></header>
    {attempt ? <BrickRallyBoard key={attempt} map={map} lives={settings.lives} timeLimitMs={(settings.timerSeconds ?? BRICK_MAX_SECONDS) * 1000} /> : <>
      <BrickMapPreview map={map} label={t('map')} />
      <BrickMapFields settings={settings} onChange={next => save({ ...next, timerSeconds: settings.timerSeconds })} />
      <BrickRaceRuleFields settings={settings} onChange={save} />
    </>}
    <footer className="brick-solo-actions">
      {attempt > 0 && <button type="button" onClick={() => setAttempt(0)}>{t('map')}</button>}
      <button type="button" className="primary" onClick={() => setAttempt(attempt + 1)}>{t(attempt ? 'restart' : 'play')}</button>
    </footer>
  </dialog>;
}

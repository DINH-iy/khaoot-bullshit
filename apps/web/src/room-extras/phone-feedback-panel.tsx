import { useState } from 'react';
import { Dropdown } from '../ui/dropdown.js';
import { useTexts } from '../i18n/texts.js';
import { playChime, unlockSound } from './celebrate.js';
import { MicrophoneTest } from './microphone-test.js';
import { PHONE_FEEDBACK_TEXTS } from './phone-feedback.text.js';
import { rumble, rumbleAvailable, rumbleOn, screenEffect, SCREEN_EFFECTS, setPhoneFeedback, soundEffect, SOUND_EFFECTS } from './phone-feedback.js';

export function PhoneFeedbackPanel({ canCustomize, microphone }: { canCustomize: boolean; microphone: boolean }) {
  const t = useTexts(PHONE_FEEDBACK_TEXTS);
  const [sound, setSound] = useState(soundEffect);
  const [screen, setScreen] = useState(screenEffect);
  const [vibration, setVibration] = useState(rumbleOn);
  return <div className="phone-feedback-panel">
    {canCustomize && <>
      <label>{t('sound')}<Dropdown value={sound} options={SOUND_EFFECTS.map(value => ({ value, label: t(value) }))} onChange={selected => {
        const effect = SOUND_EFFECTS.find(value => value === selected);
        if (effect) { setSound(effect); setPhoneFeedback('sound', effect); }
      }} /></label>
      <button type="button" onClick={() => { unlockSound(); playChime(1, sound); }}>{t('preview')}</button>
      <label>{t('screen')}<Dropdown value={screen} options={SCREEN_EFFECTS.map(value => ({ value, label: t(value) }))} onChange={selected => {
        const effect = SCREEN_EFFECTS.find(value => value === selected);
        if (effect) { setScreen(effect); setPhoneFeedback('screen', effect); }
      }} /></label>
    </>}
    {rumbleAvailable() && <label className="check"><input type="checkbox" checked={vibration} onChange={event => {
      const next = event.target.checked;
      setVibration(next);
      setPhoneFeedback('rumble', next ? 'on' : 'off');
      if (next) rumble(80); else navigator.vibrate(0);
    }} />{t('rumble')}</label>}
    {microphone && <MicrophoneTest />}
  </div>;
}

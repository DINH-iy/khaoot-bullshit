import { useLanguage } from '../../i18n/language.js';
import { useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import { PHONE_RESULT_TEXTS } from '../shared/phone-result.text.js';
import { ResultFacts } from '../shared/result-facts.js';

export function ClockResult({ target, elapsed }: { target: number; elapsed?: number | null | undefined }) {
  const language = useLanguage();
  const controls = useTexts(CONTROL_TEXTS);
  const t = useTexts(PHONE_RESULT_TEXTS);
  const time = (ms: number) => (ms / 1000).toLocaleString(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <div className="mg-clock-result" role="status">
    <ResultFacts facts={[[t('target'), `${time(target)} s`], [t('stopped'), elapsed == null ? '—' : `${time(elapsed)} s`]]} />
    {elapsed != null && <p className="mg-personal-note">{controls('off', { off: time(Math.abs(elapsed - target)) })}</p>}
  </div>;
}

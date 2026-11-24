import { defineTexts, useTexts } from '../../i18n/texts.js';
import { tenths } from '../shared/result-label.js';
import './cut-the-line.css';

const TEXTS = defineTexts('cut result', {
  target: 'Target', cut: 'Your cut', winner: 'Closest cut', exact: 'Exact match', one: '1 percentage point off', off: '{value} percentage points off',
}, {
  nl: { target: 'Doel', cut: 'Jouw knip', winner: 'Beste knip', exact: 'Precies goed', one: '1 procentpunt ernaast', off: '{value} procentpunten ernaast' },
  de: { target: 'Ziel', cut: 'Dein Schnitt', winner: 'Bester Schnitt', exact: 'Genau getroffen', one: '1 Prozentpunkt daneben', off: '{value} Prozentpunkte daneben' },
  ro: { target: 'Țintă', cut: 'Tăietura ta', winner: 'Cea mai apropiată', exact: 'Potrivire exactă', one: 'La 1 punct procentual', off: 'La {value} puncte procentuale' },
});

/**
 * `target` in whole percents, `cut` in tenths of a percent (as phones send it). With `locked` (a cut locked in before
 * the results), the distance stays for the reveal: the phone shows the personal outcome once.
 */
export function CutResult({ target, cut, shared = false, locked = false }: { target: number; cut?: number | undefined; shared?: boolean; locked?: boolean }) {
  const t = useTexts(TEXTS);
  const error = cut === undefined ? null : Math.abs(cut - target * 10);
  return <div className="cut-result" role="status">
    <div className="cut-result-rail" aria-hidden="true" dir="ltr">
      <span className="cut-result-target" style={{ left: `${target}%` }} />
      {cut !== undefined && <span className="cut-result-mark" style={{ left: `${cut / 10}%` }} />}
    </div>
    <dl>
      <div><dt>{t('target')}</dt><dd>{target}%</dd></div>
      {cut !== undefined && <div><dt>{t(shared ? 'winner' : 'cut')}</dt><dd>{tenths(cut)}%</dd></div>}
    </dl>
    {!locked && error !== null && <p>{error === 0 ? t('exact') : error === 10 ? t('one') : t('off', { value: tenths(error) })}</p>}
  </div>;
}

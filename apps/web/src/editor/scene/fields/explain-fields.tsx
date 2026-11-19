import { howToPlayKey, isMinigameKey, TEXT_DEFAULTS } from '@party/contracts';
import { translate } from '../../../i18n/texts.js';
import { marked } from '../../../i18n/rich.js';
import { FIELDS_TEXTS } from '../fields.text.js';
const t = (key: keyof typeof FIELDS_TEXTS.en, values?: Record<string, string | number>) => translate(FIELDS_TEXTS, key, values);
import type { Definition, Stage } from '../../model.js';

/**
 * Explain the round first: everyone sees a text before the round starts, players tap “Got it”,
 * and the host starts the round. A minigame may leave the text empty: then it shows the game's
 * standard “how to play” (Look & feel → Texts → Minigames).
 */
export function ExplainFields({ definition, stage, onChange }: { definition: Definition; stage: Stage; onChange: (next: Stage, field: string) => void }) {
  const explain = stage['explain'] as { text?: string } | undefined;
  const game = stage.kind === 'minigame' && typeof stage['game'] === 'string' && isMinigameKey(stage['game']) ? stage['game'] : null;
  const texts = (definition['presentation'] as { texts?: Record<string, string> } | undefined)?.texts ?? {};
  const standard = game ? texts[howToPlayKey(game)] ?? TEXT_DEFAULTS[howToPlayKey(game)] : null;
  const without = () => { const { explain: _explain, ...rest } = stage; return rest as Stage; };
  return <>
    <label className="choice"><input type="checkbox" checked={Boolean(explain)} onChange={event => onChange(event.target.checked ? { ...stage, explain: {} } : without(), 'explain')} />
      {t('explainFirst')}</label>
    {explain && <>
      <label>{t('explanation')}
        <textarea rows={4} maxLength={1000} value={explain.text ?? ''} placeholder={standard ?? t('explainPlaceholder')}
          onChange={event => onChange({ ...stage, explain: event.target.value ? { text: event.target.value } : {} }, 'explain-text')} /></label>
      <p className="hint">{marked(t('explainHint'))}{game ? t('explainGame') : ''}</p>
      {!game && !explain.text?.trim() && <p className="hint warn">{t('writeIt')}</p>}
    </>}
  </>;
}

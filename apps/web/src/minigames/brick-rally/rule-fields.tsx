import { BRICK_MAX_LIVES, BRICK_MAX_SECONDS, type BrickRaceSettings } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { BRICK_TEXTS } from './brick-rally.text.js';

export function BrickLivesField({ value, onChange, disabled }: {
  value: number | undefined; onChange: (value: number | undefined) => void; disabled?: boolean | undefined;
}) {
  const t = useTexts(BRICK_TEXTS);
  return <label>{t('lives')}<select value={value ?? ''} disabled={disabled} onChange={event => onChange(Number(event.target.value) || undefined)}>
    <option value="">{t('unlimited')}</option>
    {Array.from({ length: BRICK_MAX_LIVES }, (_, index) => <option key={index + 1}>{index + 1}</option>)}
  </select></label>;
}

export function BrickRaceRuleFields({ settings, onChange }: { settings: BrickRaceSettings; onChange: (settings: BrickRaceSettings) => void }) {
  const t = useTexts(BRICK_TEXTS);
  const timer = settings.timerSeconds ?? BRICK_MAX_SECONDS;
  const times = [...new Set([5, 10, 15, 30, 45, 60, 90, BRICK_MAX_SECONDS, timer])].sort((a, b) => a - b);
  return <div className="brick-rule-fields">
    <BrickLivesField value={settings.lives} onChange={lives => onChange({ ...settings, lives })} />
    <label>{t('timer')}<select value={timer} onChange={event => onChange({ ...settings, timerSeconds: Number(event.target.value) })}>
      {times.map(seconds => <option key={seconds} value={seconds}>{t('seconds', { seconds })}</option>)}
    </select></label>
  </div>;
}

import { useState } from 'react';
import { DEFAULT_POOL_FELT, DEFAULT_POOL_SHOT_SECONDS, DEFAULT_POOL_START, POOL_SHOT_SECONDS, type HeadToHeadSettings } from '@party/contracts';
import { PoolBehaviorFields } from '../head-to-head/eight-ball/behavior-fields.js';
import { PoolFeltFields } from '../head-to-head/eight-ball/felt-fields.js';
import { HOSTED_POOL_TEXTS } from '../head-to-head/eight-ball/hosted.text.js';
import { PoolStartFields } from '../head-to-head/eight-ball/start-fields.js';
import { useTexts } from '../i18n/texts.js';
import { FaIcon } from '../presentation/icons.js';
import { PickerDialog } from './challenge-pickers.js';
import { st } from './side-api.js';

type PoolSettings = HeadToHeadSettings<'eight-ball'>;

export function PoolChallengeSettings({ value, onChange }: { value: PoolSettings; onChange: (next: PoolSettings) => void }) {
  const t = useTexts(HOSTED_POOL_TEXTS);
  const [draft, setDraft] = useState<PoolSettings>();
  const close = () => setDraft(undefined);

  return <div>
    <button type="button" className="challenge-settings-trigger" aria-haspopup="dialog" onClick={() => setDraft(value)}>
      <FaIcon name="gear" /> {st('gameSettings')}
    </button>
    {draft && <PickerDialog title={st('gameSettings')} onClose={close}
      footer={<button type="button" className="primary" onClick={() => { onChange(draft); close(); }}>{st('applySettings')}</button>}>
      <div className="challenge-pool-settings" onKeyDown={event => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
      }}>
        <PoolFeltFields value={draft.felt ?? DEFAULT_POOL_FELT} onChange={felt => setDraft(current => ({ ...current, felt }))} />
        <label>{t('shotClock')}<select value={draft.shotSeconds ?? DEFAULT_POOL_SHOT_SECONDS} onChange={event => {
          const shotSeconds = POOL_SHOT_SECONDS.find(seconds => String(seconds) === event.currentTarget.value);
          if (shotSeconds !== undefined) setDraft(current => ({ ...current, shotSeconds }));
        }}>{POOL_SHOT_SECONDS.map(seconds => <option key={seconds} value={seconds}>{seconds ? t('shotSeconds', { seconds }) : t('shotOff')}</option>)}</select></label>
        <div className="challenge-pool-start">
          <PoolStartFields lineLabel="%" value={draft.start ?? DEFAULT_POOL_START} onChange={start => setDraft(current => ({ ...current, start }))} />
        </div>
        <PoolBehaviorFields value={draft.ballBehavior ?? { preset: 'arcade' }} onChange={ballBehavior => setDraft(current => ({ ...current, ballBehavior }))} />
      </div>
    </PickerDialog>}
  </div>;
}

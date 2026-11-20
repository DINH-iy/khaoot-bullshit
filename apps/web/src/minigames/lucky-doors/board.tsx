import { DoorsViewSchema, type MinigameSettings } from '@party/contracts';
import './lucky-doors.css';
import { translate } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import type { StepRenderer } from '../shared/steps/step-game.js';

const c = (key: keyof typeof CONTROL_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROL_TEXTS, key, values);

export const doors: StepRenderer = {
  question: () => c('chooseDoor'),
  label: option => c('door', { number: Number(option) + 1 }),
  board: (side, settings) => {
    const picked = DoorsViewSchema.safeParse(side.view).data?.picked ?? null; const count = (settings as MinigameSettings<'lucky-doors'>).doorsMilli.length;
    return <ol className="mg-doors step-doors" aria-label={c('doors')}>{Array.from({ length: count }, (_, index) => <li key={index} className={`mg-door${picked === index ? ' picked' : ''}`}>{index + 1}</li>)}</ol>;
  },
};

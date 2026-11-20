import { Mark } from '../../presentation/mark-icons.js';
import './majority.css';
import { translate } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../shared/controls.text.js';
import type { StepRenderer } from '../shared/steps/step-game.js';

const c = (key: keyof typeof CONTROL_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROL_TEXTS, key, values);

export const majority: StepRenderer = {
  question: () => c('majority'),
  label: option => <span className="side-choice"><Mark text={option === 'left' ? '←' : '→'} />{c(option === 'left' ? 'left' : 'right')}</span>,
  // Only whether a side has chosen: what it chose stays secret until the reveal.
  board: side => <span className={`step-chosen${side.options ? '' : ' yes'}`}>{side.options ? '…' : c('chosen')}</span>,
};

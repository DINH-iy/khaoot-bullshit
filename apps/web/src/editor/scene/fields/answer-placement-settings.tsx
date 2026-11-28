import { MIN_ANSWER_HEIGHT_PERCENT, MIN_ANSWER_WIDTH_PERCENT, type AnswerOption, type AnswerPlacement } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { Dropdown } from '../../../ui/dropdown.js';
import { NumberSetting } from '../../controls/number-setting.js';
import { ANSWER_PLACEMENT_TEXTS } from './answer-placement.text.js';

const controls = [
  { key: 'x', min: 0 }, { key: 'y', min: 0 },
  { key: 'width', min: MIN_ANSWER_WIDTH_PERCENT }, { key: 'height', min: MIN_ANSWER_HEIGHT_PERCENT },
  { key: 'rotation', min: -180 },
] as const;

export function AnswerPlacementSettings({ options, selected, select, measure, change }: {
  options: readonly AnswerOption[]; selected: string | undefined; select: (key: string) => void;
  measure: (key: string) => AnswerPlacement | undefined; change: (key: string, placement?: AnswerPlacement) => void;
}) {
  const t = useTexts(ANSWER_PLACEMENT_TEXTS);
  const active = options.find(option => option.key === selected);
  const position = active?.placement;
  return <div className="answer-placement-settings">
    <label>{t('selected')}<Dropdown value={active?.key ?? ''} placeholder={t('selected')} onChange={select}
      options={options.map((option, index) => ({ value: option.key, label: `${index + 1}. ${option.label}` }))} /></label>
    {active && <>
      <div className="slide-position-values">
        {controls.map(({ key, min }) => <label key={key}>{t(key)}<NumberSetting key={active.key} value={position?.[key]}
          min={min} max={key === 'rotation' ? 180 : 100} step={key === 'rotation' ? 1 : 0.1}
          placeholder={key === 'rotation' ? '0' : t('auto')} onChange={value => {
            if (key === 'rotation' && value === undefined && position?.rotation !== undefined) {
              change(active.key, { ...position, rotation: undefined });
            }
            if (value !== undefined) change(active.key, { ...(position ?? measure(active.key) ?? { x: 50, y: 65, width: 40, height: 12 }), [key]: value });
          }} /></label>)}
      </div>
      {position && <button className="small-button" type="button" onClick={() => change(active.key)}>{t('restore')}</button>}
    </>}
  </div>;
}

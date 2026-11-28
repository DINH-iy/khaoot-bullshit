import type { CSSProperties } from 'react';
import { answerMark, type AnswerOption, type AnswerPlacement, type FullTheme } from '@party/contracts';
import { Mark } from './mark-icons.js';
import { slideObjectStyle } from './slide-object.js';

export function answerPlacementStyle(placement: AnswerPlacement): CSSProperties {
  return { ...slideObjectStyle(placement), height: `${placement.height}%`, rotate: placement.rotation ? `${placement.rotation}deg` : undefined };
}

export const answerAccent = (index: number) => `var(--a${index % 8 + 1})`;

export function SlideAnswers({ options, theme, label }: { options: readonly AnswerOption[]; theme: FullTheme; label: string }) {
  if (!options.some(option => option.placement)) return null;
  return <ol className="scene-slide-layer scene-slide-answers options-board" aria-label={label}>
    {options.map((option, index) => {
      if (!option.placement) return null;
      const mark = answerMark(theme, index, options.length);
      return <li key={option.key} className="scene-positioned-answer" style={{
        ...answerPlacementStyle(option.placement), '--positioned-answer-color': answerAccent(index),
      } as CSSProperties}>
        {mark !== null && <span className="answer-mark" aria-hidden="true"><Mark text={mark} /></span>}{option.label}
      </li>;
    })}
  </ol>;
}

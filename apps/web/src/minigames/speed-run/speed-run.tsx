import { COURSE_WIDTH, SPEED_RUN_COURSE, SPEED_RUN_START, type MinigameSettings, type RaceDirection } from '@party/contracts';
import { defineTexts, translate, useTexts } from '../../i18n/texts.js';
import type { StepRenderer } from '../shared/steps/step-game.js';
import './speed-run.css';

const TEXTS = defineTexts('speed-run', {
  course: 'Obstacle course', position: 'Row {row}, column {column}', move: 'Move toward the finish',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right',
}, {
  nl: { course: 'Hindernisbaan', position: 'Rij {row}, kolom {column}', move: 'Ga naar de finish', up: 'Omhoog', down: 'Omlaag', left: 'Links', right: 'Rechts' },
  de: { course: 'Hindernisparcours', position: 'Zeile {row}, Spalte {column}', move: 'Fahre zum Ziel', up: 'Hoch', down: 'Runter', left: 'Links', right: 'Rechts' },
  ro: { course: 'Traseu cu obstacole', position: 'Rândul {row}, coloana {column}', move: 'Mergi spre sosire', up: 'Sus', down: 'Jos', left: 'Stânga', right: 'Dreapta' },
});
const ARROWS = { up: '↑', left: '←', down: '↓', right: '→' } as const;

export function SpeedRunBoard({ cell = SPEED_RUN_START, course = SPEED_RUN_COURSE }: { cell?: number; course?: readonly string[] }) {
  const t = useTexts(TEXTS);
  return <div className="speed-run-board" role="img" aria-label={`${t('course')}. ${t('position', { row: Math.floor(cell / COURSE_WIDTH) + 1, column: cell % COURSE_WIDTH + 1 })}`}>
    {course.join('').split('').map((tile, index) => <span key={index} aria-hidden="true"
      className={`race-cell${tile === '#' ? ' wall' : ''}${index === cell ? ' runner' : ''}${tile === 'F' ? ' finish' : ''}`}>
      {index === cell ? '●' : tile === 'F' ? '⚑' : tile === 'S' ? '○' : ''}
    </span>)}
  </div>;
}

export const speedRunRenderer: StepRenderer = {
  question: () => translate(TEXTS, 'move'),
  label: option => {
    const direction = option as RaceDirection;
    return <><span aria-hidden="true">{ARROWS[direction]}</span> {translate(TEXTS, direction)}</>;
  },
  board: (side, settings) => <SpeedRunBoard cell={(side.view as { cell: number } | null)?.cell ?? SPEED_RUN_START} course={(settings as MinigameSettings<'speed-run'>).course ?? SPEED_RUN_COURSE} />,
};

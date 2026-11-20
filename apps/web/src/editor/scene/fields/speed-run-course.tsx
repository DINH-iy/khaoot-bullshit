import { useId, useState } from 'react';
import { COURSE_WIDTH, SPEED_RUN_COURSE, SPEED_RUN_FINISH, SPEED_RUN_START, raceCourseHasRoute } from '@party/contracts';
import { defineTexts, useTexts } from '../../../i18n/texts.js';

const TEXTS = defineTexts('speed-run-course-editor', {
  title: 'Obstacle course', instructions: 'Tap a square to add or remove a wall.',
  cell: 'Row {row}, column {column}', blocked: 'Leave a path from the start to the flag.',
  standard: 'Use built-in course', edit: 'Customize course', save: 'Apply course', cancel: 'Cancel',
}, {
  nl: { title: 'Hindernisbaan', instructions: 'Tik op een vakje om een muur toe te voegen of te verwijderen.', cell: 'Rij {row}, kolom {column}', blocked: 'Laat een pad open van de start naar de vlag.', standard: 'Gebruik de standaardbaan', edit: 'Baan aanpassen', save: 'Baan toepassen', cancel: 'Annuleren' },
  de: { title: 'Hindernisparcours', instructions: 'Tippe auf ein Feld, um eine Mauer hinzuzufügen oder zu entfernen.', cell: 'Zeile {row}, Spalte {column}', blocked: 'Lass einen Weg vom Start bis zur Flagge frei.', standard: 'Standardparcours verwenden', edit: 'Parcours anpassen', save: 'Parcours übernehmen', cancel: 'Abbrechen' },
  ro: { title: 'Traseu cu obstacole', instructions: 'Atinge o celulă pentru a adăuga sau elimina un zid.', cell: 'Rândul {row}, coloana {column}', blocked: 'Lasă o cale liberă de la start până la steag.', standard: 'Folosește traseul standard', edit: 'Personalizează traseul', save: 'Aplică traseul', cancel: 'Anulează' },
});

export function SpeedRunCourseFields({ course, onChange }: { course?: string[] | undefined; onChange: (value?: string[]) => void }) {
  const t = useTexts(TEXTS);
  const id = useId();
  const [editing, setEditing] = useState<string[]>();
  if (!editing) return <div className="actions">
    <button type="button" className="small-button" onClick={() => setEditing([...(course ?? SPEED_RUN_COURSE)])}>{t('edit')}</button>
    {course && <button type="button" className="small-button" onClick={() => onChange()}>{t('standard')}</button>}
  </div>;

  const available = raceCourseHasRoute(editing);
  const toggle = (index: number) => {
    const row = Math.floor(index / COURSE_WIDTH);
    const column = index % COURSE_WIDTH;
    const tiles = editing[row]!.split('');
    tiles[column] = tiles[column] === '#' ? '.' : '#';
    setEditing(editing.map((line, at) => at === row ? tiles.join('') : line));
  };
  return <section aria-labelledby={id}>
    <h4 id={id}>{t('title')}</h4>
    <p className="hint">{t('instructions')}</p>
    <div className="speed-run-board speed-run-edit">{editing.join('').split('').map((tile, index) => {
      const fixed = index === SPEED_RUN_START || index === SPEED_RUN_FINISH;
      return <button type="button" key={index} disabled={fixed} aria-pressed={tile === '#'}
        aria-label={t('cell', { row: Math.floor(index / COURSE_WIDTH) + 1, column: index % COURSE_WIDTH + 1 })}
        className={`race-cell${tile === '#' ? ' wall' : ''}`} onClick={() => toggle(index)}>
        {tile === 'S' ? '○' : tile === 'F' ? '⚑' : ''}
      </button>;
    })}</div>
    {!available && <p className="hint warn" role="status">{t('blocked')}</p>}
    <div className="actions">
      <button type="button" className="small-button" disabled={!available} onClick={() => { onChange(editing); setEditing(undefined); }}>{t('save')}</button>
      <button type="button" className="small-button" onClick={() => setEditing(undefined)}>{t('cancel')}</button>
    </div>
  </section>;
}

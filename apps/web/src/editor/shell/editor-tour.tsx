import { useState } from 'react';
import { defineTexts, useTexts } from '../../i18n/texts.js';

const TOUR_KEY = 'party-editor-tour-seen';
export function needsEditorTour() {
  try { return !localStorage.getItem(TOUR_KEY); } catch { return true; }
}
export function finishEditorTour() {
  try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* Storage can be disabled. */ }
}

export const TOUR_TEXTS = defineTexts('editorTour', {
  title: 'Editor tour', next: 'Next tip', skip: 'Skip tour', done: 'Finish tour',
  flow: 'Build your game in Flow. Drag between scene ports to connect them. Shift-drag on the background to select several scenes.',
  scene: 'Double-click a scene to edit it. Use Phone preview to see what players will see.',
  shortcuts: 'Press ? to open Help & shortcuts. Undo is available from the top bar or the editor menu.',
}, {
  nl: { title: 'Editorrondleiding', next: 'Volgende tip', skip: 'Overslaan', done: 'Afronden', flow: 'Bouw je spel in Flow. Sleep tussen scènepoorten om ze te verbinden. Sleep met Shift over de achtergrond om meerdere scènes te kiezen.', scene: 'Dubbelklik op een scène om die te bewerken. Bekijk met Telefoonvoorbeeld wat spelers zien.', shortcuts: 'Druk op ? voor Hulp en sneltoetsen. Ongedaan maken staat bovenaan of in het editormenu.' },
  de: { title: 'Editor-Tour', next: 'Nächster Tipp', skip: 'Überspringen', done: 'Beenden', flow: 'Baue dein Spiel in Flow. Ziehe zwischen Szenenanschlüssen, um sie zu verbinden. Ziehe mit Umschalt auf dem Hintergrund, um mehrere Szenen auszuwählen.', scene: 'Doppelklicke eine Szene zum Bearbeiten. Die Handy-Vorschau zeigt die Spieleransicht.', shortcuts: 'Drücke ? für Hilfe und Tastenkürzel. Rückgängig findest du oben oder im Editormenü.' },
  ro: { title: 'Turul editorului', next: 'Următorul sfat', skip: 'Sari peste tur', done: 'Încheie turul', flow: 'Construiește jocul în Flux. Trage între porturile scenelor pentru a le conecta. Ține apăsat Shift și trage pe fundal pentru a selecta mai multe scene.', scene: 'Dă dublu clic pe o scenă ca s-o editezi. Previzualizarea pe telefon arată ce văd jucătorii.', shortcuts: 'Apasă ? pentru Ajutor și scurtături. Poți anula o modificare din bara de sus sau din meniul editorului.' },
});

const steps = ['flow', 'scene', 'shortcuts'] as const;
export function EditorTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const t = useTexts(TOUR_TEXTS);
  const last = step === steps.length - 1;
  return <div role="region" className="editor-tour" aria-label={t('title')}>
    <p aria-live="polite">{t(steps[step]!)}</p>
    <div>
      {!last && <button type="button" className="small-button" onClick={onClose}>{t('skip')}</button>}
      <button type="button" className="small-button accent" onClick={last ? onClose : () => setStep(step + 1)}>{t(last ? 'done' : 'next')}</button>
    </div>
  </div>;
}

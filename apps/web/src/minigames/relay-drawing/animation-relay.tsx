import { useEffect, useState } from 'react';
import { ANIMATION_WORDS, type Drawing } from '@party/contracts';
import { useDrawings, DrawingView } from '../../drawing/drawing-view.js';
import { useLanguage } from '../../i18n/language.js';
import { defineTexts, useTexts } from '../../i18n/texts.js';

const WORDS = {
  en: ANIMATION_WORDS,
  nl: ['raket', 'schildpad', 'vulkaan', 'skateboard', 'octopus', 'sneeuwpop', 'helikopter', 'kikker', 'waterval', 'trein', 'robot', 'ballon'],
  de: ['Rakete', 'Schildkröte', 'Vulkan', 'Skateboard', 'Oktopus', 'Schneemann', 'Hubschrauber', 'Frosch', 'Wasserfall', 'Zug', 'Roboter', 'Ballon'],
  ro: ['rachetă', 'țestoasă', 'vulcan', 'skateboard', 'caracatiță', 'om de zăpadă', 'elicopter', 'broască', 'cascadă', 'tren', 'robot', 'balon'],
};
export const ANIMATION_TEXTS = defineTexts('animation-relay', {
  play: 'Play animation', pause: 'Pause animation', next: 'Next frame', frame: 'Frame {frame} of {total}',
  draw: 'Your team draws {word}', guess: 'What did this team animate?', waiting: 'Wait for the other team’s frames.',
  needTeams: 'A second team is needed to guess the animation.', settings: 'Draw animation frames',
  settingsHint: 'Each turn adds a separate frame. Teams get secret prompts and guess another team’s animation.',
}, {
  nl: { play: 'Speel animatie af', pause: 'Pauzeer animatie', next: 'Volgend beeld', frame: 'Beeld {frame} van {total}', draw: 'Jouw team tekent {word}', guess: 'Wat heeft dit team geanimeerd?', waiting: 'Wacht op de beelden van het andere team.', needTeams: 'Er is een tweede team nodig om de animatie te raden.', settings: 'Teken animatiebeelden', settingsHint: 'Iedere beurt voegt een apart beeld toe. Teams krijgen een geheim woord en raden de animatie van een ander team.' },
  de: { play: 'Animation abspielen', pause: 'Animation pausieren', next: 'Nächstes Bild', frame: 'Bild {frame} von {total}', draw: 'Dein Team zeichnet {word}', guess: 'Was hat dieses Team animiert?', waiting: 'Warte auf die Bilder des anderen Teams.', needTeams: 'Zum Raten wird ein zweites Team benötigt.', settings: 'Animationsbilder zeichnen', settingsHint: 'Jeder Zug erstellt ein eigenes Bild. Teams bekommen geheime Begriffe und erraten die Animation eines anderen Teams.' },
  ro: { play: 'Redă animația', pause: 'Pune animația pe pauză', next: 'Cadrul următor', frame: 'Cadrul {frame} din {total}', draw: 'Echipa ta desenează {word}', guess: 'Ce a animat această echipă?', waiting: 'Așteaptă cadrele celeilalte echipe.', needTeams: 'Este nevoie de o a doua echipă pentru a ghici animația.', settings: 'Desenează cadre de animație', settingsHint: 'Fiecare tură adaugă un cadru separat. Echipele primesc cuvinte secrete și ghicesc animația altei echipe.' },
});

export const useAnimationWords = () => WORDS[useLanguage()];

export function DrawingAnimation({ sessionId, assetIds, label }: { sessionId: string; assetIds: string[]; label: string }) {
  const drawings = useDrawings(sessionId, assetIds);
  return <AnimationFrames drawings={drawings} label={label} />;
}

export function AnimationFrames({ drawings, label }: { drawings: Drawing[]; label: string }) {
  const t = useTexts(ANIMATION_TEXTS);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(() => !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const count = drawings.length;
  useEffect(() => {
    if (!playing || count < 2) return;
    const timer = setInterval(() => setFrame(value => (value + 1) % count), 450);
    return () => clearInterval(timer);
  }, [playing, count]);
  const at = count ? frame % count : 0;
  const drawing = drawings[at];
  return <div className="drawing-animation">
    <DrawingView drawings={drawing ? [drawing] : []} label={label} />
    {count > 1 && <div className="actions">
      <button type="button" className="small-button" onClick={() => setPlaying(value => !value)}>{t(playing ? 'pause' : 'play')}</button>
      {!playing && <button type="button" className="small-button" onClick={() => setFrame(value => (value + 1) % count)}>{t('next')}</button>}
      {!playing && <span className="hint">{t('frame', { frame: at + 1, total: count })}</span>}
    </div>}
  </div>;
}

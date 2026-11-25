import { HANGMAN_PARTS, hangmanParts, HangmanOwnViewSchema, HangmanViewSchema, type StepSideView } from '@party/contracts';
import { translate } from '../../i18n/texts.js';
import type { StepRenderer } from '../shared/steps/step-game.js';
import { HANGMAN_TEXTS } from './hangman.text.js';
import './hangman.css';

const h = (key: keyof typeof HANGMAN_TEXTS.en, values?: Record<string, string | number>) => translate(HANGMAN_TEXTS, key, values);

// The gallows in HANGMAN_PARTS strokes, drawn in this order: ground, pole, beam, brace, rope, head, body, arms, legs.
const STROKES = ['M8 92h52', 'M22 92V8', 'M22 8h42', 'M22 26 40 8', 'M64 8v12', 'circle', 'M64 40v26', 'M64 48 52 58M64 48l12 10', 'M64 66 54 82', 'M64 66l10 16'];

/** The gallows so far: `parts` of HANGMAN_PARTS strokes. */
export function Gallows({ parts, label, small = false }: { parts: number; label: string; small?: boolean }) {
  return <svg className={`hangman-gallows${small ? ' small' : ''}${parts >= HANGMAN_PARTS ? ' hanged' : ''}`} viewBox="0 0 84 96" role="img" aria-label={label}>
    {/* The whole gallows faintly, the parts so far solid. */}
    {STROKES.map((stroke, index) => { const className = index < parts ? undefined : 'todo';
      return stroke === 'circle' ? <circle key={index} className={className} cx="64" cy="30" r="10" /> : <path key={index} className={className} d={stroke} />; })}
  </svg>;
}

/** The word as tiles: found letters, blanks, and spaces or hyphens as gaps. */
export function WordTiles({ pattern, label }: { pattern: string; label: string }) {
  return <p className="hangman-word" aria-label={label}>{[...pattern].map((char, index) => char === ' ' ? <span key={index} className="hangman-gap" />
    : <span key={index} className={`hangman-tile${char === '_' ? ' blank' : ''}${char === '-' ? ' dash' : ''}`} aria-hidden="true">{char === '_' ? '' : char.toUpperCase()}</span>)}</p>;
}

function Board({ side, mine }: { side: StepSideView; mine: boolean }) {
  const view = HangmanViewSchema.safeParse(side.view); if (!view.success) return null;
  const own = mine ? HangmanOwnViewSchema.safeParse(side.own) : null;
  const { mask, found, wrong, lives, solved, hanged } = view.data;
  const total = [...mask].filter(char => char === '_').length;
  const gallows = <Gallows parts={hanged ? HANGMAN_PARTS : hangmanParts(wrong, lives)} label={h('gallows', { wrong, lives })} small={!mine} />;
  if (own?.success) {
    const missed = own.data.guessed.filter(letter => !own.data.pattern.includes(letter));
    return <div className="hangman-board mine">
      {gallows}
      <div className="hangman-side">
        <WordTiles pattern={own.data.pattern} label={h('word', { pattern: own.data.pattern.replace(/_/g, '…').toUpperCase() })} />
        <p className="hangman-count">{solved ? <strong className="hangman-ok">✓ {h('solved')}</strong> : hanged ? <strong className="hangman-out">{h('hanged')}</strong> : h('wrongLeft', { wrong, left: lives - wrong })}</p>
        {missed.length > 0 && <p className="hangman-missed" aria-label={`${h('wrongLetters')}: ${missed.join(', ').toUpperCase()}`}><span aria-hidden="true">{missed.join(' ').toUpperCase()}</span></p>}
      </div>
    </div>;
  }
  // Another side (or the shared screen): its gallows and how many letters it found, never which.
  return <div className="hangman-board">{gallows}<span className="hangman-progress">{solved ? `✓ ${h('solved')}` : hanged ? h('hanged') : h('found', { found, total })}</span></div>;
}

export const hangman: StepRenderer = {
  question: () => h('ask'),
  label: option => <span aria-label={h('letter', { letter: option.toUpperCase() })}>{option.toUpperCase()}</span>,
  board: (side, _settings, mine) => <Board side={side} mine={mine} />,
};

import { useState } from 'react';
import { HANGMAN_PARTS, hangmanParts, hangmanWordMove, HangmanOwnViewSchema, HangmanViewSchema, HangmanWordSchema, readHangmanWordMove, type StepSideView } from '@party/contracts';
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
        {own.data.words?.length ? <p className="hangman-missed words" aria-label={`${h('wrongWords')}: ${own.data.words.join(', ').toUpperCase()}`}><span aria-hidden="true">{own.data.words.join(' · ').toUpperCase()}</span></p> : null}
      </div>
    </div>;
  }
  // Another side (or the shared screen): its gallows and how many letters it found, never which.
  return <div className="hangman-board">{gallows}<span className="hangman-progress">{solved ? `✓ ${h('solved')}` : hanged ? h('hanged') : h('found', { found, total })}</span></div>;
}

/** Guessing the whole word: a short button that opens the field (the letters stay the main way to play). */
function WordGuess({ own, disabled, onChoose }: { own: unknown; disabled: boolean; onChoose: (option: string) => void }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState('');
  const tried = HangmanOwnViewSchema.safeParse(own).data?.words ?? [];
  const word = HangmanWordSchema.safeParse(text); const valid = word.success && !tried.includes(word.data);
  if (!open) return <button type="button" className="ghost hangman-word-open" disabled={disabled} onClick={() => setOpen(true)}>{h('guessWord')}</button>;
  return <form className="hangman-word-guess" onSubmit={event => { event.preventDefault(); if (valid) { onChoose(hangmanWordMove(word.data)); setText(''); setOpen(false); } }}>
    <label>{h('wordField')}<input value={text} maxLength={40} autoComplete="off" autoCapitalize="none" spellCheck={false} autoFocus onChange={event => setText(event.target.value)} /></label>
    <button type="submit" className="primary" disabled={disabled || !valid}>{h('guess')}</button>
    <small>{h('wordCost')}</small>
  </form>;
}

export const hangman: StepRenderer = {
  question: () => h('ask'),
  label: option => { const word = readHangmanWordMove(option);
    return word ? <span>{h('wordMove', { word: word.toUpperCase() })}</span> : <span aria-label={h('letter', { letter: option.toUpperCase() })}>{option.toUpperCase()}</span>; },
  extra: ({ view, disabled, onChoose }) => <WordGuess own={view} disabled={disabled} onChoose={onChoose} />,
  board: (side, _settings, mine) => <Board side={side} mine={mine} />,
};

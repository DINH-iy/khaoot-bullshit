import type { ArcadeGame } from '@party/contracts';
import { FaIcon } from './icons.js';

/** One small symbol per minigame or duel, for game badges (editor previews, the arcade's game tiles). Decorative. */
export function GameSymbol({ game }: { game: ArcadeGame }) {
  return game === 'stop-clock' ? <FaIcon name="stopwatch" /> : game === 'speed-run' ? <FaIcon name="boot" /> : game === 'bus' ? <FaIcon name="heart" />
    : game === 'perfect-circle' ? '◯' : game === 'relay-drawing' ? '✎' : game === 'lucky-doors' ? <Doors /> : game === 'majority' ? '↔' : game === 'hangman' ? 'A_' : game === 'undercover' ? '?'
    : game === 'cut-the-line' ? '┿' : game === 'match-the-angle' ? '∠' : game === 'count-the-dots' ? '•••' : game === 'red-or-black-roulette' ? '◉'
    : game === 'heads-or-tails' ? '◐' : game === 'clap-beat' ? '♪' : game === 'draw-the-graph' ? '⟋'
    : game === 'rps' ? '✊' : game === 'tictactoe' ? '#' : game === 'chess' ? '♞' : game === 'creature-duel' ? '⚔' : game === 'eight-ball' ? '8'
    : <FaIcon name="bolt" />;
}

/** Three doors, drawn so they always fit their badge (text bars came out wider in some browsers' fonts). */
function Doors() {
  return <svg viewBox="0 0 24 16" width="1.4em" height="0.95em" fill="currentColor" aria-hidden="true" style={{ display: 'block' }}>
    {[0, 8.5, 17].map(x => <path key={x} d={`M${x} 16V2.5A2.5 2.5 0 0 1 ${x + 2.5} 0h2A2.5 2.5 0 0 1 ${x + 7} 2.5V16Z`} />)}
  </svg>;
}

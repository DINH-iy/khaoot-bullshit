import type { ArcadeGame } from '@party/contracts';
import { FaIcon } from './icons.js';

/** One small symbol per minigame or duel, for game badges (editor previews, the arcade's game tiles). Decorative. */
export function GameSymbol({ game }: { game: ArcadeGame }) {
  return game === 'stop-clock' ? <FaIcon name="stopwatch" /> : game === 'speed-run' ? <FaIcon name="boot" /> : game === 'bus' ? <FaIcon name="heart" />
    : game === 'perfect-circle' ? '◯' : game === 'relay-drawing' ? '✎' : game === 'lucky-doors' ? '▮▮▮' : game === 'majority' ? '↔'
    : game === 'cut-the-line' ? '┿' : game === 'match-the-angle' ? '∠' : game === 'count-the-dots' ? '•••' : game === 'red-or-black-roulette' ? '◉'
    : game === 'heads-or-tails' ? '◐' : game === 'clap-beat' ? '♪' : game === 'draw-the-graph' ? '⟋'
    : game === 'rps' ? '✊' : game === 'tictactoe' ? '#' : game === 'chess' ? '♞' : game === 'creature-duel' ? '⚔' : game === 'eight-ball' ? '8'
    : <FaIcon name="bolt" />;
}

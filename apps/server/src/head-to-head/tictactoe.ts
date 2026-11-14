import { illegal, type HeadToHeadRules, type Seat } from './engine.js';

// The squares taken, in order: seat 0 took the 1st, 3rd, 5th…; the board and the replay follow from it.
interface TicTacToe { moves: number[] }
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const cellsOf = (moves: number[]) => { const cells = Array<Seat | null>(9).fill(null); moves.forEach((cell, index) => { cells[cell] = index % 2 === 0 ? 0 : 1; }); return cells; };
const lineOf = (cells: (Seat | null)[]) => LINES.find(([a, b, c]) => cells[a!] !== null && cells[a!] === cells[b!] && cells[a!] === cells[c!]) ?? null;

/** Tic-tac-toe: seat 0 starts; three in a row wins, a full board is a draw. */
export const tictactoe: HeadToHeadRules<'tictactoe', TicTacToe> = {
  start: () => ({ moves: [] }),
  turn: data => tictactoe.outcome(data) ? null : data.moves.length % 2 === 0 ? 0 : 1,
  apply(data, seat, move) {
    illegal(tictactoe.turn(data) === seat, 'Not your turn');
    illegal(!data.moves.includes(move.cell), 'That square is taken');
    return { moves: [...data.moves, move.cell] };
  },
  outcome(data) {
    const cells = cellsOf(data.moves); const line = lineOf(cells);
    if (line) return { kind: 'win', seat: cells[line[0]!]!, reason: 'played' };
    return data.moves.length === 9 ? { kind: 'draw' } : null;
  },
  board: data => { const cells = cellsOf(data.moves); return { game: 'tictactoe', cells, line: lineOf(cells) }; },
  replay: data => ({ game: 'tictactoe', moves: data.moves }),
};

import { Chess } from 'chess.js';
import { illegal, type HeadToHeadRules, type Seat } from './engine.js';

// Chess with every rule (check, castling, en passant, promotion, the draw rules),
// from chess.js. The state is the list of moves, replayed on every use, so
// repetition draws are judged on the whole game. Seat 0 plays white.
interface ChessGame { moves: string[] }
const replay = (data: ChessGame) => { const game = new Chess(); for (const move of data.moves) game.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) }); return game; };
const seatToMove = (game: Chess): Seat => game.turn() === 'w' ? 0 : 1;

export const chess: HeadToHeadRules<'chess', ChessGame> = {
  start: () => ({ moves: [] }),
  turn: data => { const game = replay(data); return game.isGameOver() ? null : seatToMove(game); },
  apply(data, seat, move) {
    const game = replay(data);
    illegal(!game.isGameOver(), 'The game is over');
    illegal(seatToMove(game) === seat, 'Not your turn');
    let played;
    try { played = game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) }); } catch { played = null; }
    illegal(played, 'Illegal move');
    return { moves: [...data.moves, `${played.from}${played.to}${played.promotion ?? ''}`] };
  },
  outcome(data) {
    const game = replay(data);
    // Checkmate: the side to move has lost. Stalemate, repetition, insufficient material and the 50-move rule are draws.
    if (game.isCheckmate()) return { kind: 'win', seat: seatToMove(game) === 0 ? 1 : 0, reason: 'played' };
    return game.isDraw() || game.isStalemate() ? { kind: 'draw' } : null;
  },
  board(data, viewer) {
    const game = replay(data); const last = game.history({ verbose: true }).at(-1);
    const mine = viewer !== null && !game.isGameOver() && seatToMove(game) === viewer;
    // One entry per from-to pair; a promotion asks the player which piece.
    const legal = mine ? [...new Map(game.moves({ verbose: true }).map(entry => [`${entry.from}${entry.to}`, { from: entry.from, to: entry.to, promotion: Boolean(entry.promotion) }])).values()] : [];
    return { game: 'chess', fen: game.fen(), check: game.inCheck(), lastMove: last ? { from: last.from, to: last.to } : null, legal, moves: data.moves.length };
  },
  replay(data) {
    const game = new Chess(); const frames = [{ fen: game.fen(), from: null as string | null, to: null as string | null }];
    for (const move of data.moves) { const played = game.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) }); frames.push({ fen: game.fen(), from: played.from, to: played.to }); }
    return { game: 'chess', frames };
  },
};

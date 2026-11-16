import { useState, type ReactNode } from 'react';
import { HEAD_TO_HEAD_GAMES, type HeadToHeadKey, type HeadToHeadMove, type HeadToHeadView } from '@party/contracts';
import { Replay } from './replay.js';
import { PIECES, RPS_ICONS, squaresOf } from './pieces.js';
import './head-to-head.css';

type Board<K extends HeadToHeadKey> = Extract<HeadToHeadView['board'], { game: K }>;
interface BoardProps<K extends HeadToHeadKey> { view: HeadToHeadView; board: Board<K>; names: [string, string]; canMove: boolean; onMove: (move: HeadToHeadMove) => void }

const RPS_ORDER = ['rock', 'paper', 'scissors'] as const;

function RpsBoard({ view, board, names, canMove, onMove }: BoardProps<'rps'>) {
  const me = view.seat; const mine = me === null ? null : board.picked[me];
  return <div className="h2h-rps">
    {/* The score as a scoreboard, and the last round as two big picks with the winner lit up: readable at a glance. */}
    <div className="h2h-score" role="group" aria-label={`Score: ${names[0]} ${board.wins[0]}, ${names[1]} ${board.wins[1]}, first to ${board.firstTo}`}>
      {([0, 1] as const).map(seat => <div key={seat} className={`h2h-side${me === seat ? ' you' : ''}`}><span className="h2h-name">{names[seat]}{me === seat ? ' (you)' : ''}</span><strong>{board.wins[seat]}</strong></div>)}
      <small>first to {board.firstTo}</small>
    </div>
    {board.last && <div className="h2h-last" role="group" aria-live="polite" aria-label={`Last round: ${board.last.picks[0]} against ${board.last.picks[1]}, ${board.last.winner === null ? 'a tie' : `${names[board.last.winner]} wins the round`}`}>
      <p className="h2h-last-title">Last round</p>
      <div className="h2h-last-picks">{([0, 1] as const).map(seat => <div key={seat} className={board.last!.winner === seat ? 'won' : board.last!.winner === null ? 'tie' : 'lost'}>
        <span aria-hidden="true">{RPS_ICONS[board.last!.picks[seat]]}</span><small>{names[seat]}</small></div>)}</div>
      <p className="h2h-last-result">{board.last.winner === null ? 'A tie, again!' : `${names[board.last.winner]} wins the round`}</p>
    </div>}
    {me !== null && !view.outcome && <>
      <p>{mine ? `You picked ${RPS_ICONS[board.yourPick!]}. Waiting for ${names[me === 0 ? 1 : 0]}…` : `Round ${board.round}: pick one`}</p>
      <div className="h2h-rps-picks" role="group" aria-label="Your pick">
        {RPS_ORDER.map(pick => <button key={pick} type="button" disabled={!canMove || Boolean(mine)} aria-pressed={board.yourPick === pick} onClick={() => onMove({ game: 'rps', pick })}><span aria-hidden="true">{RPS_ICONS[pick]}</span>{pick}</button>)}
      </div></>}
    {me === null && !view.outcome && <p>{board.picked.map((done, seat) => `${names[seat]}: ${done ? 'picked' : 'thinking…'}`).join(' · ')}</p>}
  </div>;
}

function TicTacToeBoard({ view, board, names, canMove, onMove }: BoardProps<'tictactoe'>) {
  const marks = ['✕', '◯'];
  return <div className="h2h-ttt" role="grid" aria-label={`Tic-tac-toe: ${names[0]} ✕, ${names[1]} ◯`}>
    {[0, 1, 2].map(row => <div key={row} role="row" className="h2h-ttt-row">{[0, 1, 2].map(column => { const cell = row * 3 + column; const owner = board.cells[cell];
      return <button key={cell} type="button" role="gridcell" className={board.line?.includes(cell) ? 'line' : undefined} disabled={!canMove || owner !== null || view.turn !== view.seat}
        aria-label={`Row ${row + 1}, column ${column + 1}: ${owner === null || owner === undefined ? 'empty' : names[owner]}`} onClick={() => onMove({ game: 'tictactoe', cell })}>{owner === null || owner === undefined ? '' : marks[owner]}</button>; })}</div>)}
  </div>;
}

function ChessBoard({ view, board, canMove, onMove }: BoardProps<'chess'>) {
  const [from, setFrom] = useState<string | null>(null); const [promoting, setPromoting] = useState<{ from: string; to: string } | null>(null);
  const flip = view.seat === 1; const squares = squaresOf(board.fen); const ordered = flip ? [...squares].reverse() : squares;
  const targets = from ? board.legal.filter(move => move.from === from) : [];
  const tap = (square: string) => {
    if (!canMove) return;
    const target = targets.find(move => move.to === square);
    if (from && target) { if (target.promotion) setPromoting({ from, to: square }); else { onMove({ game: 'chess', from, to: square }); setFrom(null); } return; }
    setFrom(board.legal.some(move => move.from === square) ? square : null);
  };
  const dark = (square: string) => ('abcdefgh'.indexOf(square[0]!) + Number(square[1])) % 2 === 0;
  return <div className="h2h-chess">
    {board.check && !view.outcome && <p className="h2h-check" role="status">Check!</p>}
    <div className="h2h-chess-board" role="grid" aria-label="Chess board">
      {ordered.map(({ square, piece }) => <button key={square} type="button" role="gridcell" onClick={() => tap(square)}
        className={['sq', dark(square) ? 'dark' : 'light', from === square ? 'from' : '', targets.some(move => move.to === square) ? 'target' : '', board.lastMove && (board.lastMove.from === square || board.lastMove.to === square) ? 'last' : ''].join(' ')}
        aria-label={`${square}${piece ? `: ${piece === piece.toUpperCase() ? 'white' : 'black'} ${({ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' } as Record<string, string>)[piece.toLowerCase()]}` : ''}`}>
        <span className={piece && piece === piece.toUpperCase() ? 'white' : 'black'} aria-hidden="true">{piece ? `${PIECES[piece]}︎` : ''}</span></button>)}
    </div>
    {promoting && <div className="h2h-promote" role="group" aria-label="Promote to">
      {(['q', 'r', 'b', 'n'] as const).map(piece => <button key={piece} type="button" onClick={() => { onMove({ game: 'chess', from: promoting.from, to: promoting.to, promotion: piece }); setPromoting(null); setFrom(null); }}>
        {PIECES[view.seat === 1 ? piece : piece.toUpperCase()]}{'︎'}<span className="visually-hidden">{({ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' })[piece]}</span></button>)}
      <button type="button" className="ghost" onClick={() => setPromoting(null)}>Cancel</button></div>}
  </div>;
}

/** The registry of boards: one per head-to-head game, chosen by the game's key. */
const BOARDS: { [K in HeadToHeadKey]: (props: BoardProps<K>) => ReactNode } = { rps: RpsBoard, tictactoe: TicTacToeBoard, chess: ChessBoard };

/**
 * A head-to-head game as one phone (or screen) sees it: whose turn, the board,
 * resigning, and once it is over the result and its replay.
 */
export function HeadToHead({ view, names, busy, onMove, onResign }: { view: HeadToHeadView; names: [string, string]; busy: boolean; onMove: (move: HeadToHeadMove) => void; onResign?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const Board = BOARDS[view.game] as (props: BoardProps<HeadToHeadKey>) => ReactNode;
  const turnText = view.outcome ? null : view.turn === 'both' ? 'Both pick at once' : view.turn === view.seat ? 'Your move' : view.turn !== null ? `${names[view.turn]}’s move` : null;
  const result = !view.outcome ? null : view.outcome.kind === 'draw' ? 'A draw!' : `${names[view.outcome.seat]} wins${view.outcome.reason === 'resigned' ? ` (${names[view.outcome.seat === 0 ? 1 : 0]} gave up)` : ''}!`;
  return <div className={`h2h h2h-${view.game}`}>
    <p className="h2h-title"><strong>{HEAD_TO_HEAD_GAMES[view.game].name}</strong> · {names[0]} vs {names[1]}</p>
    {turnText && <p className="h2h-turn" role="status">{turnText}</p>}
    {result && <p className="h2h-result" role="status">{result}</p>}
    <Board view={view} board={view.board} names={names} canMove={!busy && view.seat !== null && !view.outcome} onMove={onMove} />
    {view.seat !== null && !view.outcome && onResign && (confirm
      ? <div className="actions"><button type="button" className="danger-outline" disabled={busy} onClick={() => { setConfirm(false); onResign(); }}>Yes, give up</button><button type="button" className="ghost" onClick={() => setConfirm(false)}>Keep playing</button></div>
      : <button type="button" className="ghost small-button" onClick={() => setConfirm(true)}>Give up</button>)}
    {view.outcome && view.replay && <Replay replay={view.replay} names={names} result={result ?? ''} />}
  </div>;
}

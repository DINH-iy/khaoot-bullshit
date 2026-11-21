import { useState, type ReactNode } from 'react';
import { HEAD_TO_HEAD_GAMES, type HeadToHeadKey, type HeadToHeadMove, type HeadToHeadView } from '@party/contracts';
import { CreatureBoard } from './creature-board.js';
import { PoolBoard } from './eight-ball/pool-board.js';
import { Replay } from './replay.js';
import { PIECES, RPS_ICONS, squaresOf } from './pieces.js';
import { h, listItem } from './h2h.text.js';
import { gameName } from '../presentation/catalog.text.js';
import './head-to-head.css';

type Board<K extends HeadToHeadKey> = Extract<HeadToHeadView['board'], { game: K }>;
interface BoardProps<K extends HeadToHeadKey> { view: HeadToHeadView; board: Board<K>; names: [string, string]; canMove: boolean; onMove: (move: HeadToHeadMove) => void; statusLabel?: string | undefined }

const RPS_ORDER = ['rock', 'paper', 'scissors'] as const;
const pickName = (pick: typeof RPS_ORDER[number]) => listItem('picks', RPS_ORDER.indexOf(pick));
const pieceName = (piece: string) => listItem('pieces', 'kqrbnp'.indexOf(piece.toLowerCase()));

function RpsBoard({ view, board, names, canMove, onMove }: BoardProps<'rps'>) {
  const me = view.seat; const mine = me === null ? null : board.picked[me];
  return <div className="h2h-rps">
    {/* The score as a scoreboard, and the last round as two big picks with the winner lit up: readable at a glance. */}
    <div className="h2h-score" role="group" aria-label={h('score', { first: names[0], firstWins: board.wins[0], second: names[1], secondWins: board.wins[1], target: board.firstTo })}>
      {([0, 1] as const).map(seat => <div key={seat} className={`h2h-side${me === seat ? ' you' : ''}`}><span className="h2h-name">{names[seat]}{me === seat ? h('you') : ''}</span><strong>{board.wins[seat]}</strong></div>)}
      <small>{h('firstTo', { target: board.firstTo })}</small>
    </div>
    {board.last && <div className="h2h-last" role="group" aria-live="polite" aria-label={h('lastRoundLabel', { firstPick: pickName(board.last.picks[0]), secondPick: pickName(board.last.picks[1]), result: board.last.winner === null ? h('aTie') : h('winsRound', { name: names[board.last.winner] }) })}>
      <p className="h2h-last-title">{h('lastRound')}</p>
      <div className="h2h-last-picks">{([0, 1] as const).map(seat => <div key={seat} className={board.last!.winner === seat ? 'won' : board.last!.winner === null ? 'tie' : 'lost'}>
        <span aria-hidden="true">{RPS_ICONS[board.last!.picks[seat]]}</span><small>{names[seat]}</small></div>)}</div>
      <p className="h2h-last-result">{board.last.winner === null ? h('tieAgain') : h('winsRound', { name: names[board.last.winner] })}</p>
    </div>}
    {me !== null && !view.outcome && <>
      <p>{mine ? h('youPicked', { pick: RPS_ICONS[board.yourPick!], name: names[me === 0 ? 1 : 0] }) : h('pickOne', { round: board.round })}</p>
      <div className="h2h-rps-picks" role="group" aria-label={h('yourPick')}>
        {RPS_ORDER.map(pick => <button key={pick} type="button" disabled={!canMove || Boolean(mine)} aria-pressed={board.yourPick === pick} onClick={() => onMove({ game: 'rps', pick })}><span aria-hidden="true">{RPS_ICONS[pick]}</span>{pickName(pick)}</button>)}
      </div></>}
    {me === null && !view.outcome && <p>{board.picked.map((done, seat) => `${names[seat]}: ${h(done ? 'picked' : 'thinking')}`).join(' · ')}</p>}
  </div>;
}

function TicTacToeBoard({ view, board, names, canMove, onMove }: BoardProps<'tictactoe'>) {
  const marks = ['✕', '◯'];
  return <div className="h2h-ttt" role="grid" aria-label={h('ttt', { first: names[0], second: names[1] })}>
    {[0, 1, 2].map(row => <div key={row} role="row" className="h2h-ttt-row">{[0, 1, 2].map(column => { const cell = row * 3 + column; const owner = board.cells[cell];
      return <button key={cell} type="button" role="gridcell" className={board.line?.includes(cell) ? 'line' : undefined} disabled={!canMove || owner !== null || view.turn !== view.seat}
        aria-label={h('cell', { row: row + 1, column: column + 1, owner: owner === null || owner === undefined ? h('empty') : names[owner] })} onClick={() => onMove({ game: 'tictactoe', cell })}>{owner === null || owner === undefined ? '' : marks[owner]}</button>; })}</div>)}
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
    {board.check && !view.outcome && <p className="h2h-check" role="status">{h('check')}</p>}
    <div className="h2h-chess-board" role="grid" aria-label={h('chessBoard')}>
      {ordered.map(({ square, piece }) => <button key={square} type="button" role="gridcell" onClick={() => tap(square)}
        className={['sq', dark(square) ? 'dark' : 'light', from === square ? 'from' : '', targets.some(move => move.to === square) ? 'target' : '', board.lastMove && (board.lastMove.from === square || board.lastMove.to === square) ? 'last' : ''].join(' ')}
        aria-label={`${square}${piece ? `: ${h('piece', { color: h(piece === piece.toUpperCase() ? 'white' : 'black'), piece: pieceName(piece) })}` : ''}`}>
        <span className={piece && piece === piece.toUpperCase() ? 'white' : 'black'} aria-hidden="true">{piece ? `${PIECES[piece]}︎` : ''}</span></button>)}
    </div>
    {promoting && <div className="h2h-promote" role="group" aria-label={h('promoteTo')}>
      {(['q', 'r', 'b', 'n'] as const).map(piece => <button key={piece} type="button" onClick={() => { onMove({ game: 'chess', from: promoting.from, to: promoting.to, promotion: piece }); setPromoting(null); setFrom(null); }}>
        {PIECES[view.seat === 1 ? piece : piece.toUpperCase()]}{'︎'}<span className="visually-hidden">{pieceName(piece)}</span></button>)}
      <button type="button" className="ghost" onClick={() => setPromoting(null)}>{h('cancel')}</button></div>}
  </div>;
}

/** The registry of boards: one per head-to-head game, chosen by the game's key. */
const BOARDS: { [K in HeadToHeadKey]: (props: BoardProps<K>) => ReactNode } = { rps: RpsBoard, tictactoe: TicTacToeBoard, chess: ChessBoard, 'creature-duel': CreatureBoard, 'eight-ball': PoolBoard };

/**
 * A head-to-head game as one phone (or screen) sees it: whose turn, the board,
 * resigning, and once it is over the result and its replay.
 */
export function HeadToHead({ view, names, busy, onMove, onResign, showTurnName = false }: { view: HeadToHeadView; names: [string, string]; busy: boolean; onMove: (move: HeadToHeadMove) => void; onResign?: () => void; showTurnName?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const Board = BOARDS[view.game] as (props: BoardProps<HeadToHeadKey>) => ReactNode;
  const turnText = view.outcome ? null : view.turn === 'both' ? h('bothPick') : view.turn === null ? null
    : view.turn === view.seat && !showTurnName ? h('yourMove') : h('theirMove', { name: names[view.turn] });
  const result = !view.outcome ? null : view.outcome.kind === 'draw' ? h('draw') : view.outcome.reason === 'resigned' ? h('winsGaveUp', { name: names[view.outcome.seat], other: names[view.outcome.seat === 0 ? 1 : 0] }) : h('wins', { name: names[view.outcome.seat] });
  return <div className={`h2h h2h-${view.game}`}>
    {view.game !== 'eight-ball' && <p className="h2h-title"><strong>{gameName(view.game) || HEAD_TO_HEAD_GAMES[view.game].name}</strong><span className="h2h-title-dot" aria-hidden="true"> · </span>{h('versus', { first: names[0], second: names[1] })}</p>}
    {view.game !== 'eight-ball' && turnText && <p className="h2h-turn" role="status">{turnText}</p>}
    {result && <p className="h2h-result" role="status">{result}</p>}
    <Board view={view} board={view.board} names={names} canMove={!busy && view.seat !== null && !view.outcome} onMove={onMove} statusLabel={result ?? turnText ?? undefined} />
    {view.seat !== null && !view.outcome && onResign && (confirm
      ? <div className="actions"><button type="button" className="danger-outline" disabled={busy} onClick={() => { setConfirm(false); onResign(); }}>{h('yesGiveUp')}</button><button type="button" className="ghost" onClick={() => setConfirm(false)}>{h('keepPlaying')}</button></div>
      : <button type="button" className="ghost small-button" onClick={() => setConfirm(true)}>{h('giveUp')}</button>)}
    {view.outcome && view.replay && <Replay replay={view.replay} names={names} result={result ?? ''} />}
  </div>;
}

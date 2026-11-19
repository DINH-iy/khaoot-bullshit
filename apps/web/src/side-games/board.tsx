import { useEffect, useState } from 'react';
import { GamblingBoardSchema, type GamblerRow, type GamblingBoard } from '@party/contracts';
import { sideApi, sideProblem, st } from './side-api.js';

function Rows({ rows, self, empty }: { rows: GamblerRow[]; self: string | null; empty: string }) {
  if (!rows.length) return <p className="sheet-title">{empty}</p>;
  return <table className="gamble-board">
    <thead><tr><th scope="col">#</th><th scope="col">{st('name')}</th><th scope="col">{st('bet')}</th><th scope="col">{st('net')}</th><th scope="col">{st('chipsCol')}</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.playerId ?? row.name}-${index}`} className={row.playerId && row.playerId === self ? 'self' : ''}>
      <td>{index + 1}</td>
      <td>{row.name}{row.refills > 0 && <small title={st('refills')}>{st('broke', { count: row.refills })}</small>}{row.biggestWin > 0 && <small>{st('bestWin', { amount: row.biggestWin })}</small>}</td>
      <td>{row.wagered.toLocaleString()}</td><td className={row.won - row.wagered >= 0 ? 'up' : 'down'}>{(row.won - row.wagered).toLocaleString()}</td><td>{row.balance.toLocaleString()}</td>
    </tr>)}</tbody>
  </table>;
}

/** Who gambled how much: this room, and every person (account) across all games. */
export function Board({ sessionId, self }: { sessionId: string; self: string | null }) {
  const [board, setBoard] = useState<GamblingBoard>(); const [error, setError] = useState('');
  useEffect(() => { void sideApi(sessionId, '/board').then(data => setBoard(GamblingBoardSchema.parse(data))).catch(cause => setError(sideProblem(cause))); }, [sessionId]);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!board) return <p role="status">{st('loadingBoard')}</p>;
  return <div className="side-game board">
    <h3 className="side-subhead">{st('thisRoom')}</h3><Rows rows={board.room} self={self} empty={st('nobody')} />
    <h3 className="side-subhead">{st('allTime')}</h3><Rows rows={board.allTime} self={null} empty={st('accountOnly')} />
    <p className="sheet-title">{st('boardNote')}</p>
  </div>;
}

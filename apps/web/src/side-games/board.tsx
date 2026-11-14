import { useEffect, useState } from 'react';
import { GamblingBoardSchema, type GamblerRow, type GamblingBoard } from '@party/contracts';
import { sideApi, sideProblem } from './side-api.js';

function Rows({ rows, self, empty }: { rows: GamblerRow[]; self: string | null; empty: string }) {
  if (!rows.length) return <p className="sheet-title">{empty}</p>;
  return <table className="gamble-board">
    <thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Bet</th><th scope="col">Net</th><th scope="col">Chips</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.playerId ?? row.name}-${index}`} className={row.playerId && row.playerId === self ? 'self' : ''}>
      <td>{index + 1}</td>
      <td>{row.name}{row.refills > 0 && <small title="Refills taken"> · {row.refills}× broke</small>}{row.biggestWin > 0 && <small> · best win {row.biggestWin}</small>}</td>
      <td>{row.wagered.toLocaleString()}</td><td className={row.won - row.wagered >= 0 ? 'up' : 'down'}>{(row.won - row.wagered).toLocaleString()}</td><td>{row.balance.toLocaleString()}</td>
    </tr>)}</tbody>
  </table>;
}

/** Who gambled how much: this room, and every person (account) across all games. */
export function Board({ sessionId, self }: { sessionId: string; self: string | null }) {
  const [board, setBoard] = useState<GamblingBoard>(); const [error, setError] = useState('');
  useEffect(() => { void sideApi(sessionId, '/board').then(data => setBoard(GamblingBoardSchema.parse(data))).catch(cause => setError(sideProblem(cause))); }, [sessionId]);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!board) return <p role="status">Loading the leaderboard…</p>;
  return <div className="side-game board">
    <h3 className="side-subhead">This room</h3><Rows rows={board.room} self={self} empty="Nobody has played yet." />
    <h3 className="side-subhead">All time</h3><Rows rows={board.allTime} self={null} empty="Only people with an account count here. Ask the organiser for your personal link." />
    <p className="sheet-title">Bet is everything put in, net is what came back minus that. Play chips only.</p>
  </div>;
}

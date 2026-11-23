import { useEffect, useState } from 'react';
import { accuracy, LeaderboardSchema, winRate, type Leaderboard as Board, type PersonStats, type RankingKey } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { PageButtons } from '../ui/paged-result-list.js';

// The leaderboard's titles (the server picks the top three of each over everyone; see LEADERBOARD_TITLES).
const TITLES: Record<string, { icon: string; title: string; what: string; show?: (value: number) => string }> = {
  wins: { icon: '🏆', title: 'Champion', what: 'most games won' },
  right: { icon: '🧠', title: 'Brainiac', what: 'most right answers' },
  wrong: { icon: '🤡', title: 'Confidently wrong', what: 'most wrong answers' },
  accuracy10: { icon: '🎯', title: 'Sharpshooter', what: 'best share right (10+ answers)', show: value => `${value}%` },
  games: { icon: '🎉', title: 'Never misses a party', what: 'most games played' },
  arcadeWins: { icon: '🕹️', title: 'Arcade king', what: 'most arcade rounds won' },
  duelsWon: { icon: '⚔️', title: 'Duel master', what: 'most challenges won' },
  biggestWin: { icon: '💰', title: 'High roller', what: 'biggest win in one side game', show: value => `${value.toLocaleString()} chips` },
};

interface Column { key: RankingKey; label: string; value: (stats: PersonStats) => number | null; show?: (stats: PersonStats) => string }
const COLUMNS: Column[] = [
  { key: 'games', label: 'Games', value: stats => stats.games },
  { key: 'wins', label: 'Wins', value: stats => stats.wins },
  { key: 'winRate', label: 'Win %', value: winRate, show: stats => winRate(stats) === null ? '–' : `${winRate(stats)}%` },
  { key: 'podiums', label: 'Top 3', value: stats => stats.podiums },
  { key: 'points', label: 'Points', value: stats => stats.points },
  { key: 'right', label: 'Right', value: stats => stats.right },
  { key: 'wrong', label: 'Wrong', value: stats => stats.wrong },
  { key: 'accuracy', label: 'Right %', value: stats => accuracy(stats), show: stats => accuracy(stats) === null ? '–' : `${accuracy(stats)}%` },
  { key: 'minigames', label: 'Minigames', value: stats => stats.minigames },
  { key: 'arcadeWins', label: 'Arcade wins', value: stats => stats.arcadeWins },
  { key: 'duelsWon', label: 'Duels won', value: stats => stats.duelsWon, show: stats => `${stats.duelsWon}–${stats.duelsLost}` },
];

/** Everyone's totals: the titles (top three each), then a table that sorts by any column, a page at a time. */
export function Leaderboard({ onOpen }: { onOpen: (id: string) => void }) {
  const [sort, setSort] = useState<RankingKey>('wins'); const [page, setPage] = useState(0);
  const [board, setBoard] = useState<Board>(); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void roomApi<unknown>(`/api/host/people/stats?sort=${sort}&page=${page}`).then(result => { if (live) { setBoard(LeaderboardSchema.parse(result)); setFailed(false); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [sort, page]);
  if (failed) return <p role="alert" className="error">The leaderboard could not be loaded. Check that the server is running and try again.</p>;
  if (!board) return <p role="status">Loading the leaderboard…</p>;
  if (!board.played) return <p className="admin-empty">No games played by people yet. Once someone with a personal key has finished a game, the leaderboard fills up.</p>;
  const pages = Math.ceil(board.total / board.pageSize); const from = page * board.pageSize + 1;
  return <>
    <ul className="hall-of-fame" aria-label="Titles">{board.titles.map(({ key, top }) => {
      const title = TITLES[key]!; const show = (value: number) => title.show ? title.show(value) : value.toLocaleString();
      return <li key={key} className="fame-card">
        <span className="fame-icon" aria-hidden="true">{title.icon}</span>
        <span className="fame-title">{title.title}</span><small className="fame-what">{title.what}</small>
        {top.length ? <>
          <button type="button" className="fame-winner" onClick={() => onOpen(top[0]!.personId)}>{top[0]!.name}<span>{show(top[0]!.value)}</span></button>
          {top.length > 1 && <ol className="fame-rest" start={2}>{top.slice(1).map(row => <li key={row.personId}>{row.name} <span>{show(row.value)}</span></li>)}</ol>}
        </> : <span className="fame-nobody">Nobody yet</span>}
      </li>;
    })}</ul>
    <div className="leaderboard-wrap"><table className="leaderboard">
      <thead><tr><th scope="col" className="num">#</th><th scope="col">Name</th>
        {COLUMNS.map(item => <th key={item.key} scope="col" className="num" aria-sort={item.key === sort ? 'descending' : undefined}>
          <button type="button" onClick={() => { setSort(item.key); setPage(0); }}>{item.label}{item.key === sort && <span aria-hidden="true"> ▾</span>}</button></th>)}</tr></thead>
      <tbody>{board.rows.map((row, index) => <tr key={row.stats.personId}>
        {/* A shared place is shown once, on its first row. */}
        <td className="num">{index > 0 && board.rows[index - 1]!.place === row.place ? '' : row.place.toLocaleString()}</td>
        <th scope="row"><button type="button" className="leaderboard-name" onClick={() => onOpen(row.stats.personId)}>{row.name}</button></th>
        {COLUMNS.map(item => <td key={item.key} className={`num${item.key === sort ? ' sorted' : ''}`}>{item.show ? item.show(row.stats) : (item.value(row.stats) ?? 0).toLocaleString()}</td>)}
      </tr>)}</tbody>
    </table></div>
    <PageButtons page={page} pages={pages} onPage={setPage} label={`${from.toLocaleString()}–${(from + board.rows.length - 1).toLocaleString()} of ${board.total.toLocaleString()}`} />
  </>;
}

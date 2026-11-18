import { useMemo, useState } from 'react';
import type { PersonRow, PersonStats } from '@party/contracts';

/** Share of right answers in whole percent, or null with too few answers to mean anything. */
export const accuracy = (stats: PersonStats, minimum = 1) => stats.right + stats.wrong >= minimum ? Math.round(100 * stats.right / (stats.right + stats.wrong)) : null;
export const winRate = (stats: PersonStats) => stats.games ? Math.round(100 * stats.wins / stats.games) : null;

/** Place of `personId` among everyone by `pick` (higher is better; ties share a place), or null when it is 0. */
export function rankOf(all: PersonStats[], personId: string, pick: (stats: PersonStats) => number | null): number | null {
  const mine = pick(all.find(stats => stats.personId === personId)!);
  return mine ? 1 + all.filter(stats => (pick(stats) ?? -1) > mine).length : null;
}

interface Title { key: string; icon: string; title: string; what: string; pick: (stats: PersonStats) => number | null; show?: (value: number) => string }
// The leaderboard's titles: the top three for each. Accuracy needs 10 answers, so one lucky guess does not win it.
const TITLES: Title[] = [
  { key: 'wins', icon: '🏆', title: 'Champion', what: 'most games won', pick: stats => stats.wins },
  { key: 'right', icon: '🧠', title: 'Brainiac', what: 'most right answers', pick: stats => stats.right },
  { key: 'wrong', icon: '🤡', title: 'Confidently wrong', what: 'most wrong answers', pick: stats => stats.wrong },
  { key: 'accuracy', icon: '🎯', title: 'Sharpshooter', what: 'best share right (10+ answers)', pick: stats => accuracy(stats, 10), show: value => `${value}%` },
  { key: 'games', icon: '🎉', title: 'Never misses a party', what: 'most games played', pick: stats => stats.games },
  { key: 'arcade', icon: '🕹️', title: 'Arcade king', what: 'most arcade rounds won', pick: stats => stats.arcadeWins },
  { key: 'duels', icon: '⚔️', title: 'Duel master', what: 'most challenges won', pick: stats => stats.duelsWon },
  { key: 'chips', icon: '💰', title: 'High roller', what: 'biggest win in one side game', pick: stats => stats.biggestWin, show: value => `${value.toLocaleString()} chips` },
];

interface Column { key: string; label: string; value: (stats: PersonStats) => number | null; show?: (stats: PersonStats) => string }
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
  { key: 'duels', label: 'Duels won', value: stats => stats.duelsWon, show: stats => `${stats.duelsWon}–${stats.duelsLost}` },
];

/** Everyone's totals: the titles (top three each), then a table that sorts by any column. */
export function Leaderboard({ people, stats, onOpen }: { people: PersonRow[]; stats: PersonStats[]; onOpen: (id: string) => void }) {
  const names = useMemo(() => new Map(people.map(person => [person.id, person.name])), [people]);
  const [sort, setSort] = useState('wins');
  const column = COLUMNS.find(candidate => candidate.key === sort)!;
  const rows = useMemo(() => [...stats].sort((a, b) => (column.value(b) ?? -1) - (column.value(a) ?? -1) || b.points - a.points || names.get(a.personId)!.localeCompare(names.get(b.personId)!)), [stats, column, names]);
  if (!stats.some(row => row.games || row.arcadeRounds || row.duelsWon + row.duelsLost + row.duelsDrawn || row.sideRounds))
    return <p className="admin-empty">No games played by people yet. Once someone with a personal key has finished a game, the leaderboard fills up.</p>;
  return <>
    <ul className="hall-of-fame" aria-label="Titles">{TITLES.map(title => {
      const top = stats.map(row => ({ id: row.personId, value: title.pick(row) })).filter((row): row is { id: string; value: number } => !!row.value)
        .sort((a, b) => b.value - a.value || names.get(a.id)!.localeCompare(names.get(b.id)!)).slice(0, 3);
      const show = (value: number) => title.show ? title.show(value) : value.toLocaleString();
      return <li key={title.key} className="fame-card">
        <span className="fame-icon" aria-hidden="true">{title.icon}</span>
        <span className="fame-title">{title.title}</span><small className="fame-what">{title.what}</small>
        {top.length ? <>
          <button type="button" className="fame-winner" onClick={() => onOpen(top[0]!.id)}>{names.get(top[0]!.id)}<span>{show(top[0]!.value)}</span></button>
          {top.length > 1 && <ol className="fame-rest" start={2}>{top.slice(1).map(row => <li key={row.id}>{names.get(row.id)} <span>{show(row.value)}</span></li>)}</ol>}
        </> : <span className="fame-nobody">Nobody yet</span>}
      </li>;
    })}</ul>
    <div className="leaderboard-wrap"><table className="leaderboard">
      <thead><tr><th scope="col" className="num">#</th><th scope="col">Name</th>
        {COLUMNS.map(item => <th key={item.key} scope="col" className="num" aria-sort={item.key === sort ? 'descending' : undefined}>
          <button type="button" onClick={() => setSort(item.key)}>{item.label}{item.key === sort && <span aria-hidden="true"> ▾</span>}</button></th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.personId}>
        <td className="num">{index > 0 && column.value(rows[index - 1]!) === column.value(row) ? '' : index + 1}</td>
        <th scope="row"><button type="button" className="leaderboard-name" onClick={() => onOpen(row.personId)}>{names.get(row.personId)}</button></th>
        {COLUMNS.map(item => <td key={item.key} className={`num${item.key === sort ? ' sorted' : ''}`}>{item.show ? item.show(row) : (item.value(row) ?? 0).toLocaleString()}</td>)}
      </tr>)}</tbody>
    </table></div>
  </>;
}

import { HEAD_TO_HEAD_GAMES, isHeadToHeadKey, type PersonRow, type PersonStats } from '@party/contracts';
import { accuracy, rankOf, winRate } from './leaderboard.js';
import { fullMoment, seenThisWeek, shortMoment } from './people-time.js';

/** What the owner can do with a person; the People panel runs them (with their confirmations). */
export interface PersonActions {
  rename: (person: PersonRow) => void; viewKey: (person: PersonRow) => void; newKey: (person: PersonRow) => void;
  setEditor: (person: PersonRow, next: boolean) => void; signOut: (person: PersonRow) => void; remove: (person: PersonRow) => void;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('');

/** "Today 10:04" (green dot when seen this week), the full moment on hover; "never" when never signed in. */
export function LastSeen({ at }: { at: string | null }) {
  return at ? <span className={seenThisWeek(at) ? 'seen-recent' : undefined} title={fullMoment(at)}>{shortMoment(at)}</span> : <span className="seen-never">never</span>;
}

/** One person's own page: their numbers, what they may do, their key and the rest of the actions. */
export function PersonPage({ person, busy, actions, stats, all, onOpen }: { person: PersonRow; busy: boolean; actions: PersonActions; stats: PersonStats | undefined; all: PersonStats[]; onOpen?: (id: string) => void }) {
  /** "#2 of 16" under a number, when the person has one. */
  const rank = (pick: (row: PersonStats) => number | null) => { const place = stats ? rankOf(all, person.id, pick) : null; return place ? `#${place} of ${all.length}` : undefined; };
  const percent = (value: number | null) => value === null ? '–' : `${value}%`;
  const groups: [string, [string, React.ReactNode, (string | undefined)?][]][] = stats ? [
    ['Games', [
      ['Played', stats.games, rank(row => row.games)], ['Won', stats.wins, rank(row => row.wins)], ['Win %', percent(winRate(stats))],
      ['Top 3', stats.podiums, rank(row => row.podiums)], ['Points', stats.points.toLocaleString(), rank(row => row.points)], ['Minigames', stats.minigames],
    ]],
    ['Answers', [
      ['Right', stats.right, rank(row => row.right)], ['Wrong', stats.wrong, rank(row => row.wrong)], ['Right %', percent(accuracy(stats))],
    ]],
    ['Challenges', [
      ['Played', stats.duelsWon + stats.duelsLost + stats.duelsDrawn, rank(row => row.duelsWon + row.duelsLost + row.duelsDrawn)],
      ['Won', stats.duelsWon, rank(row => row.duelsWon)], ['Lost', stats.duelsLost, rank(row => row.duelsLost)], ['Draws', stats.duelsDrawn],
      ...stats.duelGames.map(game => [isHeadToHeadKey(game.game) ? HEAD_TO_HEAD_GAMES[game.game].name : game.game,
        `${game.won} won · ${game.lost} lost${game.drawn ? ` · ${game.drawn} draw` : ''}`] as [string, React.ReactNode]),
      ['Main rival', stats.rival ? <>{stats.rival.personId && onOpen ? <button type="button" className="person-link-button" onClick={() => onOpen(stats.rival!.personId!)}>{stats.rival.name}</button> : stats.rival.name}
        <small>{stats.rival.times}× played · {stats.rival.won} won, {stats.rival.lost} lost</small></> : '–'],
    ]],
    ['Arcade and side games', [
      ['Arcade rounds', stats.arcadeRounds], ['Arcade wins', stats.arcadeWins, rank(row => row.arcadeWins)],
      ['Side games', stats.sideRounds], ['Biggest win', `${stats.biggestWin.toLocaleString()} chips`], ['Chips now', person.chips.toLocaleString()],
    ]],
  ] : [];
  const facts: [string, React.ReactNode][] = [
    ['Last seen', <LastSeen at={person.lastSeenAt} />],
    ['Last game', stats?.lastGame ? <>{stats.lastGame.title} <small title={fullMoment(stats.lastGame.at)}>{shortMoment(stats.lastGame.at)}</small></> : '–'],
    ['Favourite game', stats?.favouriteGame ? <>{stats.favouriteGame.title} <small>{stats.favouriteGame.times}×</small></> : '–'],
    ['Phones', person.devices],
  ];
  return <article className="person-page" aria-labelledby="person-page-name">
    <header className="person-page-head">
      <span className={`person-initials large${person.canEdit ? ' is-editor' : ''}`} aria-hidden="true">{initials(person.name)}</span>
      <div><h2 id="person-page-name">{person.name}</h2>
        <p>{person.canEdit ? 'Player and editor' : 'Player'} · added <span title={fullMoment(person.createdAt)}>{shortMoment(person.createdAt)}</span></p></div>
    </header>

    <section className="person-card" aria-labelledby="person-stats"><h3 id="person-stats">Stats</h3>
      <dl className="person-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {!stats && <p className="person-hint">Loading the totals…</p>}
      {groups.map(([heading, items]) => <div key={heading} className="person-stat-group"><h4>{heading}</h4>
        <dl className="person-stats">{items.map(([label, value, place]) => <div key={label}><dt>{label}</dt><dd>{value}</dd>{place && <small className="person-rank">{place}</small>}</div>)}</dl></div>)}
      <p className="person-hint">Counted over finished games with a personal key; practice rooms do not count.</p></section>

    <section className="person-card" aria-labelledby="person-access"><h3 id="person-access">What {person.name} may do</h3>
      <label className="person-switch"><input type="checkbox" role="switch" checked={person.canEdit} disabled={busy} onChange={event => actions.setEditor(person, event.target.checked)} />Can edit games</label>
      <p className="person-hint">Editors make, change, publish and rehearse games. They never host rooms or see the admin menu.</p></section>

    <section className="person-card" aria-labelledby="person-key"><h3 id="person-key">Personal key</h3>
      {person.key && <p className="person-key"><code>{person.key}</code></p>}
      <p className="person-hint">Typed once on a phone (or opened as a link), that phone always joins as {person.name}.</p>
      <div className="person-buttons">
        <button type="button" className="quiet" disabled={busy || !person.hasKey || person.key === null} onClick={() => actions.viewKey(person)}>Share key</button>
        <button type="button" className="quiet" disabled={busy} onClick={() => actions.newKey(person)}>New key…</button>
        <button type="button" className="quiet" disabled={busy || !person.devices} onClick={() => actions.signOut(person)}>Sign out phones…</button>
      </div></section>

    <section className="person-card" aria-labelledby="person-account"><h3 id="person-account">Account</h3>
      <div className="person-buttons">
        <button type="button" className="quiet" disabled={busy} onClick={() => actions.rename(person)}>Rename…</button>
        <button type="button" className="danger" disabled={busy} onClick={() => actions.remove(person)}>Remove {person.name}…</button>
      </div></section>
  </article>;
}

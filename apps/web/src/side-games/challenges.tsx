import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ChallengeListSchema, ChallengeSchema, HEAD_TO_HEAD_DEFAULTS, HEAD_TO_HEAD_GAMES, HEAD_TO_HEAD_KEYS, type Challenge, type HeadToHeadKey, type HeadToHeadMove } from '@party/contracts';
import { newId } from '../room/api.js';
import { chips, sideApi, sideProblem, isMyTurn, st } from './side-api.js';
import { rich } from '../i18n/rich.js';
import { gameHowToPlay, gameName } from '../presentation/catalog.text.js';
import './side-games.css';
import { FaIcon } from '../presentation/icons.js';

// The boards (and chess) load only when a game is opened.
const HeadToHead = lazy(() => import('../head-to-head/boards.js').then(module => ({ default: module.HeadToHead })));
const problems = { ALREADY_SUBMITTED: 'cAlready', INVALID_STATE: 'cChanged', INVALID_SUBMISSION: 'cNotAllowed', NOT_FOUND: 'cGone' } as const;
const explain = (cause: unknown) => { const key = problems[(cause instanceof Error ? cause.message : '') as keyof typeof problems]; return key ? st(key) : sideProblem(cause); };
const STATUS = { INVITED: 'stInvited', PLAYING: 'stPlaying', FINISHED: 'stFinished', DECLINED: 'stDeclined', CANCELLED: 'stCancelled' } as const satisfies Record<Challenge['status'], string>;
const title = (game: HeadToHeadKey) => gameName(game) || HEAD_TO_HEAD_GAMES[game].name;

/**
 * Challenges on a player's phone: challenge another player to a head-to-head
 * game (rock paper scissors, tic-tac-toe, chess…), optionally for chips; answer
 * invitations; play; and watch or save the replay. Updates arrive over the room
 * connection (`tick`), so nothing polls.
 */
export default function Challenges({ sessionId, selfId, players, tick }: { sessionId: string; selfId: string | null; players: { id: string; displayName: string }[]; tick: number }) {
  const [list, setList] = useState<Challenge[]>(); const [balance, setBalance] = useState(0); const [withChips, setWithChips] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const load = useCallback(() => sideApi(sessionId, '/challenges').then(data => { const parsed = ChallengeListSchema.parse(data); setList(parsed.challenges); setBalance(parsed.balance); setWithChips(parsed.chips); }).catch(cause => setError(explain(cause))), [sessionId]);
  useEffect(() => { void load(); }, [load, tick]);
  const name = (id: string) => players.find(player => player.id === id)?.displayName ?? st('someone');
  const act = (path: string, body: unknown = {}) => { setBusy(true); setError(''); void sideApi(sessionId, path, body).then(data => { const updated = ChallengeSchema.parse(data); setList(current => [updated, ...(current ?? []).filter(entry => entry.id !== updated.id)]); return load(); }).catch(cause => setError(explain(cause))).finally(() => setBusy(false)); };
  if (!list) return error ? <p role="alert" className="error">{error}</p> : <p role="status">{st('loading')}</p>;
  const current = list.find(entry => entry.id === open);
  if (current) {
    const names: [string, string] = [name(current.challengerId), name(current.opponentId)];
    return <div className="challenges">
      <button type="button" className="ghost small-button" onClick={() => setOpen(null)}>‹ {st('allChallenges')}</button>
      {current.stake > 0 && <p className="hint">{st('atStake', { amount: chips(current.stake), total: chips(current.stake * 2) })}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <Suspense fallback={<p role="status">{st('openingGame')}</p>}>
        <HeadToHead view={current.view} names={names} busy={busy} onMove={(move: HeadToHeadMove) => act(`/challenges/${current.id}/move`, { move })} onResign={() => act(`/challenges/${current.id}/resign`)} />
      </Suspense>
    </div>;
  }
  const incoming = list.filter(entry => entry.status === 'INVITED' && entry.mine === 'opponent');
  const rest = list.filter(entry => !incoming.includes(entry));
  return <div className="challenges">
    {error && <p role="alert" className="error">{error}</p>}
    {incoming.length > 0 && <section aria-labelledby="incoming-heading" className="challenge-group"><h3 id="incoming-heading">{st('challenged')}</h3>
      <ul className="plain-list">{incoming.map(entry => <li key={entry.id} className="challenge-card">
        <p>{rich(st(entry.stake ? 'challengesYouFor' : 'challengesYou', { game: title(entry.game), ...(entry.stake ? { amount: chips(entry.stake) } : {}) }), { name: <strong>{name(entry.challengerId)}</strong> })}</p>
        <div className="actions"><button type="button" className="primary" disabled={busy || balance < entry.stake} onClick={() => { act(`/challenges/${entry.id}/accept`); setOpen(entry.id); }}>{st('accept')}</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => act(`/challenges/${entry.id}/close`)}>{st('noThanks')}</button></div>
        {balance < entry.stake && <p className="hint">{st('needToAccept', { amount: chips(entry.stake) })}</p>}
      </li>)}</ul></section>}
    {creating ? <NewChallenge players={players.filter(player => player.id !== selfId)} balance={balance} busy={busy} withChips={withChips} onCancel={() => setCreating(false)}
      onSend={body => { act('/challenges', body); setCreating(false); }} />
      : <button type="button" className="primary" onClick={() => setCreating(true)}>{st('challengeSomeone')}</button>}
    <section aria-labelledby="mine-heading" className="challenge-group"><h3 id="mine-heading">{st('yours')}</h3>
      {rest.length === 0 ? <p className="hint">{st('none')}</p>
        : <ul className="plain-list">{rest.map(entry => { const other = entry.mine === 'challenger' ? entry.opponentId : entry.challengerId;
          const myTurn = isMyTurn(entry);
          return <li key={entry.id} className="challenge-card">
            <p>{rich(st('withName', { game: title(entry.game) }), { name: <strong>{name(other)}</strong> })}{entry.stake ? ` · ${chips(entry.stake)}` : ''} · {myTurn ? <strong>{st('yourMove')}</strong> : st(STATUS[entry.status])}</p>
            <div className="actions">
              {(entry.status === 'PLAYING' || entry.status === 'FINISHED') && <button type="button" className="small-button" onClick={() => setOpen(entry.id)}>{st(entry.status === 'FINISHED' ? 'result' : 'open')}</button>}
              {entry.status === 'INVITED' && <button type="button" className="ghost small-button" disabled={busy} onClick={() => act(`/challenges/${entry.id}/close`)}>{st('takeBack')}</button>}
            </div></li>; })}</ul>}
    </section>
    <p className="sheet-title">{st('kept')}</p>
  </div>;
}

function NewChallenge({ players, balance, busy, onSend, onCancel, withChips }: { players: { id: string; displayName: string }[]; balance: number; busy: boolean; onSend: (body: unknown) => void; onCancel: () => void; withChips: boolean }) {
  const [opponentId, setOpponent] = useState(players[0]?.id ?? ''); const [game, setGame] = useState<HeadToHeadKey>('rps');
  const [stake, setStake] = useState('0'); const [firstTo, setFirstTo] = useState(String(HEAD_TO_HEAD_DEFAULTS.rps.firstTo));
  // Without chips in the room a challenge is always for fun.
  const amount = withChips ? Math.max(0, Math.round(Number(stake) || 0)) : 0;
  if (!players.length) return <p className="hint">{st('nobodyElse')} <button type="button" className="small-button" onClick={onCancel}><FaIcon name="arrow-rotate-left" /> {st('back')}</button></p>;
  return <form className="challenge-form" onSubmit={event => { event.preventDefault(); onSend({ challengeId: newId(), opponentId, game, stake: amount, ...(game === 'rps' ? { settings: { firstTo: Number(firstTo) } } : {}) }); }}>
    <label>{st('who')}<select value={opponentId} onChange={event => setOpponent(event.target.value)}>{players.map(player => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label>
    <label>{st('game')}<select value={game} onChange={event => setGame(event.target.value as HeadToHeadKey)}>{HEAD_TO_HEAD_KEYS.map(key => <option key={key} value={key}>{title(key)}</option>)}</select></label>
    <p className="hint">{gameHowToPlay(game) || HEAD_TO_HEAD_GAMES[game].howToPlay}</p>
    {game === 'rps' && <label>{st('firstTo')}<select value={firstTo} onChange={event => setFirstTo(event.target.value)}>{[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{st(count === 1 ? 'win' : 'wins', { count })}</option>)}</select></label>}
    {withChips && <label>{st('stake')}<input type="number" inputMode="numeric" min={0} max={balance} value={stake} onChange={event => setStake(event.target.value)} /></label>}
    {amount > 0 && <p className="hint">{st('eachPut', { amount: chips(amount), total: chips(amount * 2) })}</p>}
    <div className="actions"><button type="submit" className="primary" disabled={busy || !opponentId || amount > balance}>{st('send')}</button><button type="button" className="ghost" onClick={onCancel}>{st('cancel')}</button></div>
  </form>;
}

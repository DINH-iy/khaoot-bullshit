import { useTexts } from '../i18n/texts.js';
import { CREATURE_TEXTS } from '../head-to-head/creature-board.js';
import { Dropdown } from '../ui/dropdown.js';
import { lazy, Suspense, useState } from 'react';
import { ChallengeSchema, HEAD_TO_HEAD_DEFAULTS, HEAD_TO_HEAD_GAMES, HEAD_TO_HEAD_KEYS, type Challenge, type HeadToHeadKey, type HeadToHeadMove } from '@party/contracts';
import { newId } from '../room/api.js';
import { chips, sideApi, isMyTurn, st } from './side-api.js';
import { rich } from '../i18n/rich.js';
import { gameHowToPlay, gameName } from '../presentation/catalog.text.js';
import { challengeProblem, type useChallenges } from './use-challenges.js';
import { FaIcon } from '../presentation/icons.js';

// The boards (and chess) load only when a game is opened.
const HeadToHead = lazy(() => import('../head-to-head/boards.js').then(module => ({ default: module.HeadToHead })));
const STATUS = { INVITED: 'stInvited', PLAYING: 'stPlaying', FINISHED: 'stFinished', DECLINED: 'stDeclined', CANCELLED: 'stCancelled' } as const satisfies Record<Challenge['status'], string>;
const title = (game: HeadToHeadKey) => gameName(game) || HEAD_TO_HEAD_GAMES[game].name;

/**
 * Challenges on a player's phone: challenge another player to a head-to-head
 * game (rock paper scissors, tic-tac-toe, chess…), optionally for chips; answer
 * invitations; play; and watch or save the replay. The challenge list updates over the room connection.
 */
export function Challenges({ sessionId, selfId, players, state, withChips }: {
  sessionId: string; selfId: string | null; players: { id: string; displayName: string }[];
  state: ReturnType<typeof useChallenges>; withChips: boolean;
}) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const list = state.data?.challenges ?? [];
  const balance = state.data?.balance ?? 0;
  const name = (id: string) => players.find(player => player.id === id)?.displayName ?? st('someone');
  const act = (path: string, body: unknown = {}) => {
    setBusy(true);
    setError('');
    void sideApi(sessionId, path, body).then(data => {
      state.update(ChallengeSchema.parse(data));
      return state.refresh();
    }).catch(cause => setError(challengeProblem(cause))).finally(() => setBusy(false));
  };
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
    <section aria-labelledby="mine-heading" className="challenge-group" aria-busy={!state.data && !state.error}><h3 id="mine-heading">{st('yours')}</h3>
      {!state.data ? (state.error ? <><p role="alert" className="error">{state.error}</p><button type="button" className="small-button" onClick={() => void state.refresh()}>{st('retry')}</button></> : null)
        : rest.length === 0 ? <p className="hint">{st('none')}</p>
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
  const c = useTexts(CREATURE_TEXTS);
  const [size, setSize] = useState('1');
  const [opponentId, setOpponent] = useState(players[0]?.id ?? ''); const [game, setGame] = useState<HeadToHeadKey>('rps');
  const [stake, setStake] = useState('0'); const [firstTo, setFirstTo] = useState(String(HEAD_TO_HEAD_DEFAULTS.rps.firstTo));
  // Without chips in the room a challenge is always for fun.
  const amount = withChips ? Math.max(0, Math.round(Number(stake) || 0)) : 0;
  if (!players.length) return <p className="hint">{st('nobodyElse')} <button type="button" className="small-button" onClick={onCancel}><FaIcon name="arrow-rotate-left" /> {st('back')}</button></p>;
  return <form className="challenge-form" onSubmit={event => { event.preventDefault(); onSend({ challengeId: newId(), opponentId, game, stake: amount, ...(game === 'rps' ? { settings: { firstTo: Number(firstTo) } } : game === 'creature-duel' ? { settings: { size: Number(size) } } : {}) }); }}>
    <label>{st('who')}<Dropdown value={opponentId} onChange={setOpponent} options={players.map(player => ({ value: player.id, label: player.displayName }))} /></label>
    <label>{st('game')}<Dropdown value={game} onChange={value => setGame(value as HeadToHeadKey)} options={HEAD_TO_HEAD_KEYS.map(value => ({ value, label: title(value) }))} /></label>
    <p className="hint">{gameHowToPlay(game) || HEAD_TO_HEAD_GAMES[game].howToPlay}</p>
    {game === 'rps' && <label>{st('firstTo')}<Dropdown value={firstTo} onChange={setFirstTo} options={[1, 2, 3, 4, 5].map(count => ({ value: String(count), label: st(count === 1 ? 'win' : 'wins', { count }) }))} /></label>}
    {game === 'creature-duel' && <label>{c('teamSize')}<Dropdown value={size} onChange={setSize}
      options={[{ value: '1', label: c('solo') }, { value: '3', label: c('team') }]} /></label>}
    {withChips && <label>{st('stake')}<input type="number" inputMode="numeric" min={0} max={balance} value={stake} onChange={event => setStake(event.target.value)} /></label>}
    {amount > 0 && <p className="hint">{st('eachPut', { amount: chips(amount), total: chips(amount * 2) })}</p>}
    <div className="actions"><button type="submit" className="primary" disabled={busy || !opponentId || amount > balance}>{st('send')}</button><button type="button" className="ghost" onClick={onCancel}>{st('cancel')}</button></div>
  </form>;
}

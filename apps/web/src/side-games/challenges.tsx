import { useTexts } from '../i18n/texts.js';
import { CREATURE_TEXTS } from '../head-to-head/creature-board.js';
import { Dropdown } from '../ui/dropdown.js';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { BRICK_PRESETS, CHALLENGE_GAMES, ChallengeSchema, HEAD_TO_HEAD_DEFAULTS, type Challenge, type ChallengeGame, type HeadToHeadMove, type HeadToHeadSettings } from '@party/contracts';
import { newId } from '../room/api.js';
import { chips, sideApi, isMyTurn, st } from './side-api.js';
import { rich } from '../i18n/rich.js';
import { gameHowToPlay, gameName } from '../presentation/catalog.text.js';
import { challengeProblem, type useChallenges } from './use-challenges.js';
import { ChallengeMapPicker, OpponentPicker, type ChallengePlayer, type ChallengePreset } from './challenge-pickers.js';
import { BRICK_CHALLENGE_TEXTS } from './brick-challenge.text.js';
import { GameSymbol } from '../presentation/game-symbol.js';
import { FaIcon } from '../presentation/icons.js';
import { InviteSettings } from './challenge-invite-settings.js';
import { PoolChallengeSettings } from './challenge-pool-settings.js';
import { BottomSheet } from '../room-extras/bottom-sheet.js';

// The boards (and chess) load only when a game is opened.
const HeadToHead = lazy(() => import('../head-to-head/boards.js').then(module => ({ default: module.HeadToHead })));
const BrickChallenge = lazy(() => import('./brick-challenge.js').then(module => ({ default: module.BrickChallenge })));
const STATUS = { INVITED: 'stInvited', PLAYING: 'stPlaying', FINISHED: 'stFinished', DECLINED: 'stDeclined', CANCELLED: 'stCancelled' } as const satisfies Record<Challenge['status'], string>;

/**
 * Challenges on a player's phone: challenge another player to a head-to-head
 * game (rock paper scissors, tic-tac-toe, chess…), optionally for chips; answer
 * invitations; play; and watch or save the replay. The challenge list updates over the room connection.
 */
export function Challenges({ sessionId, selfId, players, state, withChips, offset, title, onClose }: {
  sessionId: string; selfId: string | null; players: ChallengePlayer[];
  state: ReturnType<typeof useChallenges>; withChips: boolean; offset: number; title: string; onClose: () => void;
}) {
  const race = useTexts(BRICK_CHALLENGE_TEXTS);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const viewStart = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<string | null>(null); const [creating, setCreating] = useState<ChallengeGame | null>(null);
  const list = state.data?.challenges ?? [];
  const balance = state.data?.balance ?? 0;
  const name = (id: string) => players.find(player => player.id === id)?.displayName ?? st('someone');
  const act = (path: string, body: unknown = {}, onSuccess?: (challenge: Challenge) => void) => {
    setBusy(true);
    setError('');
    void sideApi(sessionId, path, body).then(data => {
      const updated = ChallengeSchema.parse(data);
      state.update(updated);
      onSuccess?.(updated);
      return state.refresh();
    }).catch(cause => setError(challengeProblem(cause))).finally(() => setBusy(false));
  };
  const current = list.find(entry => entry.id === open && (entry.status === 'PLAYING' || entry.status === 'FINISHED'));
  useEffect(() => {
    viewStart.current?.closest('.sheet-body')?.scrollTo(0, 0);
    backButton.current?.focus({ preventScroll: true });
  }, [current?.id, creating]);
  const backLabel = st('allChallenges');
  const sheet = (children: ReactNode) => <BottomSheet title={title} onClose={onClose} roomy
    leadingAction={(current || creating) && <button ref={backButton} type="button" className="ghost small-button challenge-back"
      aria-label={backLabel} onClick={() => { setOpen(null); setCreating(null); }}><FaIcon name="arrow-right" turn={180} /></button>}>
    {children}
  </BottomSheet>;
  if (current) {
    const names: [string, string] = [name(current.challengerId), name(current.opponentId)];
    return sheet(<div ref={viewStart} className="challenges challenge-match">
      {current.stake > 0 && <p className="hint">{st('atStake', { amount: chips(current.stake), total: chips(current.stake * 2) })}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <Suspense fallback={<p role="status">{st('openingGame')}</p>}>
        {current.game === 'brick-rally' ? <BrickChallenge key={current.id} view={current.view} names={names} offset={offset} busy={busy}
          onReady={() => act(`/challenges/${current.id}/ready`)} onClear={brickTrace => act(`/challenges/${current.id}/clear`, { brickTrace })}
          onResign={() => act(`/challenges/${current.id}/resign`)} onDeadline={state.refresh} />
        : <HeadToHead view={current.view} names={names} live={{ match: current.id, seats: [current.challengerId, current.opponentId] }} busy={busy} onMove={(move: HeadToHeadMove) => act(`/challenges/${current.id}/move`, { move })} onResign={() => act(`/challenges/${current.id}/resign`)} />}
      </Suspense>
    </div>);
  }
  if (creating) return sheet(<div ref={viewStart} className="challenges">
    <h3 className="challenge-heading">{st('challengeSomeone')}</h3>
    {error && <p role="alert" className="error">{error}</p>}
    <NewChallenge initialGame={creating} players={players.filter(player => player.id !== selfId)} balance={balance} busy={busy} withChips={withChips}
      onSend={body => act('/challenges', body, () => setCreating(null))} />
  </div>);
  const incoming = list.filter(entry => entry.status === 'INVITED' && entry.mine === 'opponent');
  const rest = list.filter(entry => !incoming.includes(entry));
  return sheet(<div ref={viewStart} className="challenges challenge-hub">
    <button type="button" className="primary challenge-create" onClick={() => setCreating('rps')}>
      <FaIcon name="user-plus" /> {st('challengeSomeone')} <FaIcon name="arrow-right" />
    </button>
    {error && <p role="alert" className="error">{error}</p>}
    {incoming.length > 0 && <section aria-labelledby="incoming-heading" className="challenge-group"><h3 id="incoming-heading">{st('challenged')}</h3>
      <ul className="plain-list">{incoming.map(entry => <li key={entry.id} className="challenge-card">
        <div className="challenge-card-line"><GameMark game={entry.game} />
          <p>{rich(st(entry.stake ? 'challengesYouFor' : 'challengesYou', { game: gameName(entry.game), ...(entry.stake ? { amount: chips(entry.stake) } : {}) }), { name: <strong>{name(entry.challengerId)}</strong> })}</p>
        </div>
        <InviteSettings challenge={entry} />
        <div className="actions"><button type="button" className="primary" disabled={busy || balance < entry.stake} onClick={() => act(`/challenges/${entry.id}/accept`, {}, accepted => setOpen(accepted.id))}>{st('accept')}</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => act(`/challenges/${entry.id}/close`)}>{st('noThanks')}</button></div>
        {balance < entry.stake && <p className="hint">{st('needToAccept', { amount: chips(entry.stake) })}</p>}
      </li>)}</ul></section>}
    <section aria-labelledby="mine-heading" className="challenge-group" aria-busy={!state.data && !state.error}><h3 id="mine-heading">{st('yours')}</h3>
      {!state.data ? (state.error ? <><p role="alert" className="error">{state.error}</p><button type="button" className="small-button" onClick={() => void state.refresh()}>{st('retry')}</button></> : null)
        : rest.length === 0 ? <p className="hint">{st('none')}</p>
        : <ul className="plain-list">{rest.map(entry => { const other = entry.mine === 'challenger' ? entry.opponentId : entry.challengerId;
          const myTurn = isMyTurn(entry);
          return <li key={entry.id} className="challenge-card">
            <div className="challenge-card-line"><GameMark game={entry.game} />
              <div><p>{rich(st('withName', { game: gameName(entry.game) }), { name: <strong>{name(other)}</strong> })}</p>
                <p className="challenge-meta">{myTurn ? <strong>{entry.game === 'brick-rally' ? race('ready') : st('yourMove')}</strong> : st(STATUS[entry.status])}{entry.stake ? ` · ${chips(entry.stake)}` : ''}</p>
              </div>
            </div>
            <div className="actions">
              {(entry.status === 'PLAYING' || entry.status === 'FINISHED') && <button type="button" className="small-button" onClick={() => setOpen(entry.id)}>{entry.status === 'FINISHED' ? (entry.game === 'brick-rally' ? race('result') : st('result')) : st('open')}</button>}
              {entry.status === 'INVITED' && <button type="button" className="ghost small-button" disabled={busy} onClick={() => act(`/challenges/${entry.id}/close`)}>{st('takeBack')}</button>}
            </div></li>; })}</ul>}
    </section>
    <section aria-labelledby="challenge-games-heading" className="challenge-group"><h3 id="challenge-games-heading">{st('games')}</h3>
      <GameChoices onChoose={setCreating} />
    </section>
  </div>);
}

function NewChallenge({ initialGame, players, balance, busy, onSend, withChips }: { initialGame: ChallengeGame; players: ChallengePlayer[]; balance: number; busy: boolean; onSend: (body: unknown) => void; withChips: boolean }) {
  const c = useTexts(CREATURE_TEXTS);
  const race = useTexts(BRICK_CHALLENGE_TEXTS);
  const [preset, setPreset] = useState<ChallengePreset>(BRICK_PRESETS[0]);
  const [size, setSize] = useState('1');
  const [pool, setPool] = useState<HeadToHeadSettings<'eight-ball'>>(HEAD_TO_HEAD_DEFAULTS['eight-ball']);
  const [selectedOpponent, setOpponent] = useState<string>(); const [game, setGame] = useState(initialGame);
  const opponent = players.find(player => player.id === selectedOpponent) ?? players[0];
  const [stake, setStake] = useState('0'); const [firstTo, setFirstTo] = useState(String(HEAD_TO_HEAD_DEFAULTS.rps.firstTo));
  // Without chips in the room a challenge is always for fun.
  const amount = withChips ? Math.max(0, Math.round(Number(stake) || 0)) : 0;
  if (!opponent) return <p className="hint">{st('nobodyElse')}</p>;
  const settings = ({
    rps: { firstTo: Number(firstTo) }, 'creature-duel': { size: Number(size) }, 'brick-rally': { preset }, 'eight-ball': pool,
  } as Partial<Record<ChallengeGame, object>>)[game];
  return <form className="challenge-form" onSubmit={event => { event.preventDefault(); onSend({ challengeId: newId(), opponentId: opponent.id, game, stake: amount, settings }); }}>
    <OpponentPicker players={players} value={opponent} onChange={setOpponent} />
    <fieldset className="challenge-options"><legend>{st('game')}</legend>
      <GameChoices selected={game} onChoose={setGame} />
    </fieldset>
    <p className="hint">{game === 'brick-rally' ? race('rules') : gameHowToPlay(game)}</p>
    {game === 'rps' && <label>{st('firstTo')}<Dropdown value={firstTo} onChange={setFirstTo} options={[1, 2, 3, 4, 5].map(count => ({ value: String(count), label: st(count === 1 ? 'win' : 'wins', { count }) }))} /></label>}
    {game === 'creature-duel' && <label>{c('teamSize')}<Dropdown value={size} onChange={setSize}
      options={[{ value: '1', label: c('solo') }, { value: '3', label: c('team') }]} /></label>}
    {game === 'eight-ball' && <PoolChallengeSettings value={pool} onChange={setPool} />}
    {game === 'brick-rally' && <ChallengeMapPicker value={preset} onChange={setPreset} />}
    {withChips && <label>{st('stake')}<input type="number" inputMode="numeric" min={0} max={balance} value={stake} onChange={event => setStake(event.target.value)} /></label>}
    {amount > 0 && <p className="hint">{st('eachPut', { amount: chips(amount), total: chips(amount * 2) })}</p>}
    <button type="submit" className="primary challenge-send" disabled={busy || amount > balance}>{st('send')}</button>
  </form>;
}

function GameChoices({ selected, onChoose }: { selected?: ChallengeGame; onChoose: (game: ChallengeGame) => void }) {
  return <div className="challenge-game-grid">{CHALLENGE_GAMES.map(choice => <button key={choice} type="button"
    aria-pressed={selected === undefined ? undefined : choice === selected} onClick={() => onChoose(choice)}>
    <GameMark game={choice} /><span>{gameName(choice)}</span>
  </button>)}</div>;
}

function GameMark({ game }: { game: ChallengeGame }) {
  return <span className="challenge-game-mark" data-game={game} aria-hidden="true"><GameSymbol game={game} /></span>;
}

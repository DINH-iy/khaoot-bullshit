import { lazy, Suspense, useState } from 'react';
import { HEAD_TO_HEAD_GAMES, type HeadToHeadMove, type RoomSnapshot } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import { translate } from '../i18n/texts.js';
import { PLAY_TEXTS } from './play.text.js';
import { gameName } from '../presentation/catalog.text.js';
const p = (key: keyof typeof PLAY_TEXTS.en, values?: Record<string, string | number>) => translate(PLAY_TEXTS, key, values);
import { formatPoints } from './results.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Send = (type: string, extra: Record<string, unknown>) => void;
// The game boards (and their replays) load only when a duel is played as a game.
const HeadToHead = lazy(() => import('../head-to-head/boards.js').then(module => ({ default: module.HeadToHead })));

/**
 * A duel on every screen. The host picks the pair (unless the scene picked at
 * random) and names the winner; everyone else bets on one of the two while
 * betting is open, with the bets on each shown live. When the duel is a game,
 * the two duelists play it on their phones once betting closes, and everyone
 * else watches the board; the game names the winner itself.
 */
export function DuelPanel({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const t = useText(); const duel = stage.duel; const [repicking, setRepicking] = useState(false);
  if (!duel) return null;
  const host = state.role === 'host'; const me = state.selfPlayerId;
  const player = (id: string) => state.players.find(entry => entry.id === id);
  const name = (id: string) => player(id)?.displayName ?? '…';
  const pair = duel.duelistIds; const winner = duel.winnerId;
  const stakes = <p className="hint">{p('stakes', { points: formatPoints(duel.placesMilli[0] ?? '0') })}{duel.placesMilli[1] && duel.placesMilli[1] !== '0' ? p('runnerUp', { points: formatPoints(duel.placesMilli[1]) }) : ''}{p('rightBet', { points: formatPoints(duel.betMilli) })}
    {duel.contest.kind === 'game' ? p('playedAs', { game: gameName(duel.contest.game) || HEAD_TO_HEAD_GAMES[duel.contest.game].name }) : ''}</p>;
  if (!pair || repicking) return <div className="duel" role="region" aria-label={p('duel')}>
    {host ? <PickPair players={state.players} disabled={disabled} onPick={playerIds => { send('duel.pick', { stageRunId: stage.id, playerIds }); setRepicking(false); }} onCancel={pair ? () => setRepicking(false) : undefined} />
      : <p>{t('duel.picking')}</p>}
    {stakes}
  </div>;
  const [a, b] = pair; const total = duel.bets.reduce((sum, entry) => sum + entry.count, 0);
  const own = state.view.ownSubmission?.value.kind === 'bet' ? state.view.ownSubmission.value.playerId : null;
  const duelist = me !== null && pair.includes(me);
  const canBet = !duelist && state.role === 'player' && stage.status === 'ACTIVE' && !own && !winner && state.view.status === 'RUNNING';
  const playing = duel.contest.kind === 'game' && duel.contest.view;
  return <div className="duel" role="region" aria-label={p('duel')}>
    <div className="duel-vs">{[a, b].map((id, index) => { const bets = duel.bets.find(entry => entry.playerId === id)?.count ?? 0;
      return <div key={id} className={`duel-side${winner === id ? ' winner' : winner ? ' loser' : ''}`}>
        {player(id) && <Avatar look={player(id)!.look} size={72} />}<strong>{name(id)}</strong>
        <span className="duel-bets">{p(bets === 1 ? 'betOne' : 'betMany', { count: bets })}</span>
        <span className="duel-bar" aria-hidden="true"><span style={{ width: `${total ? Math.round(bets / total * 100) : 0}%` }} /></span>
        {canBet && <button type="button" className="primary" disabled={disabled} onClick={() => send('submission.submit', { stageRunId: stage.id, value: { kind: 'bet', playerId: id } })}>{p('betOn', { name: name(id) })}</button>}
        {host && !winner && <button type="button" disabled={disabled} onClick={() => send('duel.decide', { stageRunId: stage.id, winnerId: id })}>{p('wins', { name: name(id) })}</button>}
        {index === 0 && <span className="duel-vs-mark" aria-hidden="true">VS</span>}
      </div>; })}</div>
    {winner ? <p className="duel-result" role="status">{t('duel.won', { name: name(winner) })}{own && state.role === 'player' ? ` ${own === winner ? t('duel.betRight', { points: formatPoints(duel.betMilli) }) : t('duel.betWrong')}` : ''}</p>
      : duelist ? <p className="duel-note">{t('duel.youDuel', { name: name(pair.find(id => id !== me)!) })}{duel.contest.kind === 'game' && stage.status === 'ACTIVE' ? p('startsWhenClosed') : ''}</p>
      : own ? <p className="duel-note">{t('duel.youBet', { name: name(own) })}</p>
      : canBet ? <p className="duel-note">{t('duel.bet')}</p> : null}
    {playing && (stage.status === 'CLOSED' || winner) && <Suspense fallback={<p role="status">{p('opening')}</p>}>
      <HeadToHead view={playing} names={[name(a), name(b)]} busy={disabled || Boolean(winner)}
        onMove={(move: HeadToHeadMove) => send('duel.move', { stageRunId: stage.id, move })} onResign={() => send('duel.resign', { stageRunId: stage.id })} />
    </Suspense>}
    {host && !winner && duel.contest.kind === 'game' && duel.contest.view?.outcome?.kind === 'draw' && <p className="hint">{p('draw')}</p>}
    {host && !winner && stage.status === 'ACTIVE' && stage.submittedCount === 0 && <button type="button" className="ghost small-button" onClick={() => setRepicking(true)}>{p('changePair')}</button>}
    {stakes}
  </div>;
}

/** The host picks the two duelists: by hand, or two at random from everyone in the room. */
function PickPair({ players, disabled, onPick, onCancel }: { players: RoomSnapshot['players']; disabled: boolean; onPick: (ids: [string, string]) => void; onCancel: (() => void) | undefined }) {
  const [a, setA] = useState(players[0]?.id ?? ''); const [b, setB] = useState(players[1]?.id ?? '');
  if (players.length < 2) return <p>{p('needTwo')}</p>;
  const random = () => { const shuffled = [...players].sort(() => Math.random() - 0.5); onPick([shuffled[0]!.id, shuffled[1]!.id]); };
  return <form className="duel-pick" onSubmit={event => { event.preventDefault(); if (a && b && a !== b) onPick([a, b]); }}>
    <p className="field-title">{p('pickTwo')}</p>
    <div className="duel-pick-row">
      <label>{p('first')}<select value={a} onChange={event => setA(event.target.value)}>{players.map(entry => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
      <label>{p('second')}<select value={b} onChange={event => setB(event.target.value)}>{players.map(entry => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</select></label>
    </div>
    {a === b && <p className="hint">{p('different')}</p>}
    <div className="actions"><button type="submit" className="primary" disabled={disabled || !a || !b || a === b}>{p('startBetting')}</button>
      <button type="button" disabled={disabled} onClick={random}>{p('twoRandom')}</button>{onCancel && <button type="button" className="ghost" onClick={onCancel}>{p('keepPair')}</button>}</div>
  </form>;
}

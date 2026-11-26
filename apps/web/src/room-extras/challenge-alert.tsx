import { useState } from 'react';
import type { Challenge, RoomSnapshot } from '@party/contracts';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from '../room/extras.text.js';
import { rich } from '../i18n/rich.js';
import { BRICK_CHALLENGE_TEXTS } from '../side-games/brick-challenge.text.js';
import { gameName } from '../presentation/catalog.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import { chips, isMyTurn } from '../side-games/side-api.js';

/** What the alert is about: someone challenged you, or it is your move. */
interface Alert { key: string; challenge: Challenge; kind: 'invite' | 'turn' }

/**
 * A banner at the top of the phone when someone challenges this player (or it is
 * their move), visible without opening the menu. It stays until they open the
 * challenges or tap Later. Read when the phone opens and on every challenge update.
 */
export function ChallengeAlert({ state, challenges, needed, onOpen }: { state: RoomSnapshot; challenges: Challenge[]; needed: boolean; onOpen: () => void }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const invite = challenges.find(entry => entry.status === 'INVITED' && entry.mine === 'opponent');
  const turn = challenges.find(isMyTurn);
  const alert: Alert | null = invite ? { key: `invite:${invite.id}`, challenge: invite, kind: 'invite' }
    : turn ? { key: `turn:${turn.id}:${turn.updatedAt}`, challenge: turn, kind: 'turn' } : null;
  if (!alert || dismissed.includes(alert.key)) return null;
  const { challenge } = alert; const other = alert.kind === 'invite' || challenge.mine === 'opponent' ? challenge.challengerId : challenge.opponentId;
  const name = state.players.find(player => player.id === other)?.displayName ?? x('someone');
  const game = gameName(challenge.game);
  return <div className="challenge-alert" role="alert">
    <span className="challenge-alert-icon" aria-hidden="true">⚔️</span>
    <p>{rich(alert.kind === 'invite' ? x(challenge.stake ? 'challengesYouFor' : 'challengesYou', { game, ...(challenge.stake ? { stake: chips(challenge.stake) } : {}) }) : challenge.game === 'brick-rally' ? translate(BRICK_CHALLENGE_TEXTS, 'readyAlert') : x('yourMove', { game }), { name: <strong>{name}</strong> })}</p>
    <div className="challenge-alert-actions">
      {/* During a round side games are paused; the alert stays so it can be answered right after. */}
      <button type="button" className="small-button primary" disabled={needed} onClick={() => { setDismissed(keys => [...keys, alert.key]); onOpen(); }}>{x(needed ? 'afterRound' : 'open')}</button>
      <button type="button" className="small-button ghost" onClick={() => setDismissed(keys => [...keys, alert.key])}>{x('later')}</button>
    </div>
  </div>;
}

import { useEffect, useState } from 'react';
import { ChallengeListSchema, HEAD_TO_HEAD_GAMES, type Challenge, type RoomSnapshot } from '@party/contracts';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from '../room/extras.text.js';
import { rich } from '../i18n/rich.js';
import { gameName } from '../presentation/catalog.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import { chips, isMyTurn, sideApi } from '../side-games/side-api.js';

/** What the alert is about: someone challenged you, or it is your move. */
interface Alert { key: string; challenge: Challenge; kind: 'invite' | 'turn' }

/**
 * A banner at the top of the phone when someone challenges this player (or it is
 * their move), visible without opening the menu. It stays until they open the
 * challenges or tap Later. Read when the phone opens and on every challenge update.
 */
export function ChallengeAlert({ state, tick, needed, onOpen }: { state: RoomSnapshot; tick: number; needed: boolean; onOpen: () => void }) {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const sessionId = state.view.sessionId; const on = state.settings.sideGames;
  useEffect(() => {
    if (!on) { setAlert(null); return; }
    let mounted = true;
    void sideApi(sessionId, '/challenges').then(data => {
      if (!mounted) return;
      const list = ChallengeListSchema.parse(data).challenges;
      // An invitation comes first; otherwise a game waiting for your move. The key changes with each new move, so Later only hides this one.
      const invite = list.find(entry => entry.status === 'INVITED' && entry.mine === 'opponent');
      const turn = list.find(isMyTurn);
      setAlert(invite ? { key: `invite:${invite.id}`, challenge: invite, kind: 'invite' } : turn ? { key: `turn:${turn.id}:${turn.updatedAt}`, challenge: turn, kind: 'turn' } : null);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [sessionId, tick, on]);
  if (!alert || dismissed.includes(alert.key)) return null;
  const { challenge } = alert; const other = alert.kind === 'invite' || challenge.mine === 'opponent' ? challenge.challengerId : challenge.opponentId;
  const name = state.players.find(player => player.id === other)?.displayName ?? x('someone');
  const game = gameName(challenge.game) || HEAD_TO_HEAD_GAMES[challenge.game].name;
  return <div className="challenge-alert" role="alert">
    <span className="challenge-alert-icon" aria-hidden="true">⚔️</span>
    <p>{rich(alert.kind === 'invite' ? x(challenge.stake ? 'challengesYouFor' : 'challengesYou', { game, ...(challenge.stake ? { stake: chips(challenge.stake) } : {}) }) : x('yourMove', { game }), { name: <strong>{name}</strong> })}</p>
    <div className="challenge-alert-actions">
      {/* During a round side games are paused; the alert stays so it can be answered right after. */}
      <button type="button" className="small-button primary" disabled={needed} onClick={() => { setDismissed(keys => [...keys, alert.key]); onOpen(); }}>{x(needed ? 'afterRound' : 'open')}</button>
      <button type="button" className="small-button ghost" onClick={() => setDismissed(keys => [...keys, alert.key])}>{x('later')}</button>
    </div>
  </div>;
}

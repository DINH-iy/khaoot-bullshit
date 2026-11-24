import { type MinigameKey, type RoomSnapshot, type StakePoints } from '@party/contracts';
import { StageMedia } from './stage-media.js';
import { formatPoints } from './results.js';
import { useText } from '../presentation/look.js';
import { howToPlay } from '../minigames/shared/how-to-play.js';
import { Avatar } from '../players/avatar.js';
import { translate } from '../i18n/texts.js';
import { EXTRAS_TEXTS } from './extras.text.js';
const x = (key: keyof typeof EXTRAS_TEXTS.en, values?: Record<string, string | number>) => translate(EXTRAS_TEXTS, key, values);
import { FaIcon } from '../presentation/icons.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Send = (type: string, extra: Record<string, unknown>) => void;

/**
 * The intro before a round: the scene's text (or a minigame's “how to play”), the points at stake and a picture,
 * “Got it!” on the phones and who is ready (faces light up). The host starts the round with the big button.
 * Screen only: the phones just wait for the round, and nobody needs to tap anything.
 */
export function ExplainPanel({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const t = useText(); const explain = stage.explain; if (!explain) return null;
  if (explain.screenOnly && state.role === 'player') return <section className="explain-panel"><p className="wait-note" role="status"><FaIcon name="tv" /> {t('explain.lookUp')}</p></section>;
  // The scene's own text, or the minigame's “how to play” from this game's texts.
  const text = explain.text ?? (stage.minigame ? howToPlay(t, { ...stage.minigame, game: stage.minigame.game as MinigameKey }) : '');
  const ready = new Set(explain.readyIds); const mine = state.selfPlayerId ? ready.has(state.selfPlayerId) : false;
  const count = state.players.filter(player => ready.has(player.id)).length;
  return <section className="explain-panel" aria-labelledby={text ? 'explain-heading' : undefined} aria-label={text ? undefined : t('explain.atStake')}>
    {explain.points && <StakeBadge points={explain.points} />}
    {explain.picture && <StageMedia media={explain.picture} role={state.role} displayConnected={Boolean(state.displayConnected)} label={stage.prompt} />}
    {text && <><h3 id="explain-heading"><FaIcon name="circle-info" /> {t('explain.title')}</h3><p className="explain-text">{text}</p></>}
    {!explain.screenOnly && <>
      {state.role === 'player' && (mine ? <p className="wait-note" role="status"><FaIcon name="clock" /> {t('explain.waiting')}</p>
        : <button type="button" className="primary big explain-ok" disabled={disabled} onClick={() => send('stage.understood', { stageRunId: stage.id })}>{t('explain.ok')}</button>)}
      <p className="explain-count" role="status">{t('explain.ready', { count, total: state.players.length })}</p>
      {state.role !== 'player' && <ul className="explain-faces" aria-label={x('whoReady')}>{state.players.map(player =>
        <li key={player.id} className={ready.has(player.id) ? 'ready' : undefined}><Avatar look={player.look} size={36} /><span>{player.displayName}</span>
          {ready.has(player.id) && <span className="explain-check" aria-label={x('ready')}><FaIcon name="check" /></span>}</li>)}</ul>}
    </>}
  </section>;
}

/** The points at stake as one strong value: “Up to 1500 points”, or points per vote with the extra for the most votes. */
export function StakeBadge({ points }: { points: StakePoints }) {
  const t = useText();
  const [value, extra] = points.kind === 'round'
    ? [t(points.upTo ? 'explain.upTo' : 'explain.points', { points: formatPoints(points.milli) }), null]
    : [Number(points.perVoteMilli) > 0 ? t('explain.perVote', { points: formatPoints(points.perVoteMilli) }) : null, points.bonusMilli ? t('explain.mostVotes', { points: formatPoints(points.bonusMilli) }) : null];
  return <div className="explain-stake">
    <span className="explain-stake-label"><FaIcon name="star" /> {t('explain.atStake')}</span>
    {value && <strong className="explain-stake-value">{value}</strong>}
    {extra && (value ? <span className="explain-stake-extra">{extra}</span> : <strong className="explain-stake-value">{extra}</strong>)}
  </div>;
}

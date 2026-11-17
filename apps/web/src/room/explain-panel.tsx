import { howToPlayKey, type MinigameKey, type RoomSnapshot } from '@party/contracts';
import { useText } from '../presentation/look.js';
import { Avatar } from '../players/avatar.js';
import { FaIcon } from '../presentation/icons.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Send = (type: string, extra: Record<string, unknown>) => void;

/**
 * A scene that explains itself before it starts: the text for everyone, “Got it!” on the phones,
 * and who is ready (faces light up). The host starts the round with the big button.
 */
export function ExplainPanel({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const t = useText(); const explain = stage.explain; if (!explain) return null;
  // The scene's own text, or the minigame's “how to play” from this game's texts.
  const text = explain.text ?? (stage.minigame ? t(howToPlayKey(stage.minigame.game as MinigameKey)) : '');
  const ready = new Set(explain.readyIds); const mine = state.selfPlayerId ? ready.has(state.selfPlayerId) : false;
  const count = state.players.filter(player => ready.has(player.id)).length;
  return <section className="explain-panel" aria-labelledby="explain-heading">
    <h3 id="explain-heading"><FaIcon name="circle-info" /> {t('explain.title')}</h3>
    {text && <p className="explain-text">{text}</p>}
    {state.role === 'player' && (mine ? <p className="wait-note" role="status"><FaIcon name="clock" /> {t('explain.waiting')}</p>
      : <button type="button" className="primary big explain-ok" disabled={disabled} onClick={() => send('stage.understood', { stageRunId: stage.id })}>{t('explain.ok')}</button>)}
    <p className="explain-count" role="status">{t('explain.ready', { count, total: state.players.length })}</p>
    {state.role !== 'player' && <ul className="explain-faces" aria-label="Who is ready">{state.players.map(player =>
      <li key={player.id} className={ready.has(player.id) ? 'ready' : undefined}><Avatar look={player.look} size={36} /><span>{player.displayName}</span>
        {ready.has(player.id) && <span className="explain-check" aria-label="ready"><FaIcon name="check" /></span>}</li>)}</ul>}
  </section>;
}

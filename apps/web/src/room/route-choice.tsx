import { answerMark } from '@party/contracts';
import { useLook, useText } from '../presentation/look.js';
import type { RoomSnapshot } from '@party/contracts';
import { translate } from '../i18n/texts.js';
import { PLAY_TEXTS } from './play.text.js';
import { rich } from '../i18n/rich.js';
const joinAnd = (items: string[]) => items.length > 1 ? p('or', { list: items.slice(0, -1).join(', '), last: items.at(-1)! }) : items[0] ?? '';
const p = (key: keyof typeof PLAY_TEXTS.en, values?: Record<string, string | number>) => translate(PLAY_TEXTS, key, values);
import { SavedVoteBadge, savedVote } from './vote.js';
import { Mark } from '../presentation/mark-icons.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Route = NonNullable<Stage['route']>;
type Send = (type: string, extra: Record<string, unknown>) => void;
const labelOf = (route: Route, key: string) => route.options.find(option => option.key === key)?.label ?? key;
const why = { majority: 'byVote', host: 'byHost', default: 'byDefault', random: 'byRandom' } as const satisfies Record<NonNullable<Route['decision']>['resolution'], keyof typeof PLAY_TEXTS.en>;
const who = { players: 'everyoneVotes', captains: 'captainsVote', host: 'hostDecides' } as const satisfies Record<Route['method'], keyof typeof PLAY_TEXTS.en>;

/** Counts, the decision, and for the host: choose a route at any time until one is recorded. */
export function RouteChoice({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const t = useText(); const { theme } = useLook();
  const route = stage.route; if (!route) return null;
  const host = state.role === 'host'; const decided = route.decision;
  const saved = savedVote(state);
  const chosen = saved?.kind === 'choice' ? route.options.find(option => option.key === saved.choiceKey) : undefined;
  return <div className="route-choice" role="region" aria-label={p('routeChoice')}>
    <p>{p(who[route.method])}{route.method !== 'host' ? p('votedCount', { count: stage.submittedCount, total: stage.eligibleCount }) : ''}</p>
    {chosen && <p className="saved-vote route-saved-vote"><SavedVoteBadge /> <strong>{chosen.label}</strong></p>}
    {route.counts && <ul className="plain-list">{route.counts.map(row => <li key={row.optionKey}>{labelOf(route, row.optionKey)} · {p(row.count === 1 ? 'voteOne' : 'voteMany', { count: row.count })}</li>)}</ul>}
    {decided ? <p role="status" className="route-decision">{rich(p('partyGoes', { why: p(why[decided.resolution]) }), { route: <strong>{labelOf(route, decided.optionKey)}</strong> })}{host && !stage.revealed ? p('revealToAnnounce') : ''}</p>
      : stage.status === 'CLOSED' && !host ? <p role="status">{route.method === 'host' ? t('route.hostChoosing') : t('route.closed')}</p> : null}
    {host && route.pending && <p role="alert" className="route-pending">{route.pending === 'tie' ? p('tieBetween', { routes: joinAnd((route.leaders ?? []).map(key => labelOf(route, key))) }) : p(route.pending === 'no-votes' ? 'nobodyVoted' : 'chooseRoute')}</p>}
    {host && !decided && state.view.status === 'RUNNING' && <div className="actions">{route.options.map((option, index) =>
      <button key={option.key} className="route-button" disabled={disabled} onClick={() => send('route.decide', { stageRunId: stage.id, optionKey: option.key })}>{(() => { const mark = answerMark(theme, index, route.options.length, true); return mark === null ? null : <span className="answer-mark" aria-hidden="true"><Mark text={mark} /></span>; })()} {p(stage.status === 'ACTIVE' && route.method !== 'host' ? 'closeAndChoose' : 'choose', { route: option.label })}</button>)}</div>}
  </div>;
}

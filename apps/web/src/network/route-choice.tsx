import type { RoomSnapshot } from '@party/contracts';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Route = NonNullable<Stage['route']>;
type Send = (type: string, extra: Record<string, unknown>) => void;
const labelOf = (route: Route, key: string) => route.options.find(option => option.key === key)?.label ?? key;
const why: Record<NonNullable<Route['decision']>['resolution'], string> = { majority: 'by vote', host: 'chosen by the host', default: 'the default route', random: 'by a random pick' };
const who: Record<Route['method'], string> = { players: 'Everyone votes.', captains: 'Each team’s captain votes.', host: 'The host decides.' };

/** Counts, the decision, and for the host: choose a route at any time until one is recorded. */
export function RouteChoice({ state, stage, disabled, send }: { state: RoomSnapshot; stage: Stage; disabled: boolean; send: Send }) {
  const route = stage.route; if (!route) return null;
  const host = state.role === 'host'; const decided = route.decision;
  return <div className="route-choice" role="region" aria-label="Route choice">
    <p>{who[route.method]}{route.method !== 'host' ? ` ${stage.submittedCount} of ${stage.eligibleCount} voted.` : ''}</p>
    {route.counts && <ul className="plain-list">{route.counts.map(row => <li key={row.optionKey}>{labelOf(route, row.optionKey)} · {row.count} {row.count === 1 ? 'vote' : 'votes'}</li>)}</ul>}
    {decided ? <p role="status" className="route-decision">The party goes: <strong>{labelOf(route, decided.optionKey)}</strong> ({why[decided.resolution]}).{host && !stage.revealed ? ' Reveal to announce it.' : ''}</p>
      : stage.status === 'CLOSED' && !host ? <p role="status">{route.method === 'host' ? 'The host is choosing the route.' : 'Voting has closed. The host announces the route.'}</p> : null}
    {host && route.pending && <p role="alert" className="route-pending">{route.pending === 'tie' ? `Tie between ${(route.leaders ?? []).map(key => labelOf(route, key)).join(' and ')}. Choose a route.` : route.pending === 'no-votes' ? 'Nobody voted. Choose a route.' : 'Choose a route.'}</p>}
    {host && !decided && state.view.status === 'RUNNING' && <div className="actions">{route.options.map(option =>
      <button key={option.key} disabled={disabled} onClick={() => send('route.decide', { stageRunId: stage.id, optionKey: option.key })}>{stage.status === 'ACTIVE' && route.method !== 'host' ? `Close voting and choose ${option.label}` : `Choose ${option.label}`}</button>)}</div>}
  </div>;
}

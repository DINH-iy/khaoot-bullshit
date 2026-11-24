import { useMemo, type CSSProperties } from 'react';
import { defaultLook, DEFAULT_REVEAL_EASING, RevealEasingSchema, GRAPH_REVEAL_MS, graphPlaybackPosition, MINIGAMES, type MinigameSettings, type RoomSnapshot } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { useText } from '../../presentation/look.js';
import { Avatar } from '../../players/avatar.js';
import { formatPoints } from '../../room/results.js';
import { PLAY_TEXTS } from '../../room/play.text.js';
import { teamName } from '../../room/teams.js';
import { PagedResultList } from '../../ui/paged-result-list.js';
import { DrawingView, StoredDrawing } from '../../drawing/drawing-view.js';
import { CutResult } from '../cut-the-line/cut-result.js';
import { DotReveal } from '../count-the-dots/dot-reveal.js';
import { AngleTarget } from '../match-the-angle/match-angle.js';
import { chartInk, GraphChart } from '../draw-the-graph/graph-chart.js';
import { GRAPH_TEXTS } from '../draw-the-graph/graph.text.js';
import { CoinReveal } from '../heads-or-tails/coin.js';
import { COIN_TEXTS } from '../heads-or-tails/coin.text.js';
import { RouletteReveal } from '../red-or-black-roulette/roulette.js';
import { DrawingAnimation } from '../relay-drawing/animation-relay.js';
import { STEP_RENDERERS } from './steps/renderers.js';
import { minigameResult } from './result-label.js';
import { CONTROL_TEXTS } from './controls.text.js';
import { PHONE_RESULT_TEXTS } from './phone-result.text.js';

type Stage = NonNullable<RoomSnapshot['view']['stage']>;
type Reveal = NonNullable<Stage['reveal']>;
type Answer = Extract<Reveal['answer'], { kind: 'minigame' }>;
const PAGE_SIZE = 5;

export function MinigameResults({ state, stage, reveal, answer, offset }: {
  state: RoomSnapshot; stage: Stage; reveal: Reveal; answer: Answer; offset: number;
}) {
  const t = useText();
  const c = useTexts(CONTROL_TEXTS);
  const coinText = useTexts(COIN_TEXTS);
  const graphText = useTexts(GRAPH_TEXTS);
  const labels = useTexts(PHONE_RESULT_TEXTS);
  const playText = useTexts(PLAY_TEXTS);
  const game = answer.game;
  const minigame = stage.minigame;
  const settings = (minigame?.settings ?? MINIGAMES[game].defaults) as MinigameSettings;
  const players = new Map(state.players.map(player => [player.id, player]));
  const awards = new Map(reveal.awards.map(award => [award.playerId, award.amountMilli]));
  const teamAwards = new Map(reveal.teamAwards.map(award => [award.teamId, award.amountMilli]));
  const rankedPlayers = new Set(answer.entries.flatMap(entry => entry.playerId ? [entry.playerId] : []));
  // Points can be awarded to a team member who does not have an individual result.
  const otherAwards = reveal.awards.filter(award => !rankedPlayers.has(award.playerId));
  const nameOf = (id: string) => players.get(id)?.displayName ?? playText('formerPlayer');
  const points = (milli: string | undefined) => milli === undefined ? '—' : labels('points', { points: formatPoints(milli) });
  // A team row: the team's own award, or (when a round pays the members instead) what each member got.
  const teamPoints = (teamId: string) => {
    const own = teamAwards.get(teamId); if (own !== undefined) return points(own);
    const members = stage.teams?.teams.find(team => team.teamId === teamId)?.memberIds ?? [];
    const amounts = [...new Set(members.map(id => awards.get(id)).filter(amount => amount !== undefined))];
    return amounts.length === 1 ? labels('pointsEach', { points: formatPoints(amounts[0]!) }) : points(undefined);
  };
  const coin = answer.coin;
  const animateRoulette = state.role === 'display' || !state.displayConnected;
  const prediction = coin !== undefined || answer.roulette !== undefined;
  const cut = answer.entries.find(entry => entry.place === 1 && entry.cut !== undefined)?.cut;
  const playback = stage.graphPlayback;
  const easing = RevealEasingSchema.safeParse(minigame?.settings['revealEasing']).data ?? DEFAULT_REVEAL_EASING;
  const graphTiming = useMemo(() => playback ? {
    '--graph-reveal-easing': easing,
    '--graph-reveal-duration': `${GRAPH_REVEAL_MS}ms`,
    '--graph-reveal-elapsed': `${graphPlaybackPosition(playback, Date.now() + offset)}ms`,
    '--graph-reveal-state': playback.playingSince ? 'running' : 'paused',
  } as CSSProperties : undefined, [playback?.playingSince, playback?.positionMs, offset, easing]);
  const ranked = answer.entries.some(entry => entry.place !== null);
  const standings = answer.entries.length > 0 ? <section className={coin ? 'coin-result-list-animated' : answer.roulette !== undefined && animateRoulette
      ? 'roulette-results-animated' : playback ? 'graph-places' : undefined}>
    <h3>{prediction ? coinText('picks') : game === 'lucky-doors' ? c('whoChose') : t('minigame.places')}</h3>
    <PagedResultList ordered className="mg-podium" pageSize={PAGE_SIZE} rows={answer.entries.map(entry => {
      const { playerId, teamId } = entry;
      const name = playerId ? nameOf(playerId) : teamId ? teamName(state, teamId) : playText('formerPlayer');
      const bus = !playerId && game === 'bus' ? minigame?.steps?.sides.find(side => side.teamId === teamId) : undefined;
      const drawing = !playerId && game === 'relay-drawing' ? minigame?.relay?.teams.find(side => side.teamId === teamId) : undefined;
      const assetIds = drawing?.parts.map(part => part.assetId) ?? [];
      const picture = assetIds.length > 0 && ((settings as MinigameSettings<'relay-drawing'>).animation
        ? <DrawingAnimation sessionId={state.view.sessionId} assetIds={assetIds} label={name} />
        : <StoredDrawing sessionId={state.view.sessionId} assetIds={assetIds} label={name} />);
      const place = prediction ? <><span aria-hidden="true">{entry.place === 1 ? '✓' : '×'}</span><span className="visually-hidden">{coinText(entry.place === 1 ? 'right' : 'wrong')}</span></>
        : ranked ? entry.place ?? '–' : '–';
      return <li key={playerId ?? teamId} className={entry.place === 1 ? 'first' : undefined}>
        <span className="mg-place">{place}</span>
        <div className="mg-result-name">
          {playerId && <Avatar look={players.get(playerId)?.look ?? defaultLook(playerId)} size={28} />}
          <strong title={name}>{entry.graphHue !== undefined && <span className="graph-swatch" aria-hidden="true" style={{ background: chartInk(entry.graphHue) }} />}{name}</strong>
        </div>
        <div className="mg-result-measurement">
          {entry.stroke && <span className="mg-circle"><DrawingView drawings={[{ v: 1, strokes: [{ c: 0, w: 14, p: entry.stroke }] }]} label={c('circleBy', { name })} /></span>}
          <span>{minigameResult(game, entry.value, settings, !playerId, entry)}</span>
        </div>
        <strong className="mg-result-points">{playerId ? points(awards.get(playerId)) : teamId ? teamPoints(teamId) : points(undefined)}</strong>
        {bus && <div className="mg-result-board">{STEP_RENDERERS.bus?.board?.(bus, settings, false)}</div>}
        {picture && <div className="mg-result-drawing">{picture}</div>}
      </li>;
    })} />
  </section> : <p className="mg-personal-note">{labels('noPlay')}</p>;
  return <div key={playback ? `${playback.playingSince}:${playback.positionMs}` : stage.id}
    className={playback ? 'mg-results graph-results' : 'mg-results'} style={graphTiming}>
    {coin && <CoinReveal coin={coin} animate />}
    {answer.roulette !== undefined && <RouletteReveal pocket={answer.roulette} animate={animateRoulette} />}
    {minigame?.cutTarget !== undefined && <CutResult target={minigame.cutTarget} cut={cut} shared />}
    {minigame?.angleTarget !== undefined && <AngleTarget target={minigame.angleTarget} />}
    {answer.graph && <>
      <GraphChart chart={answer.graph} answer={answer.graph.hidden} animateReveal={Boolean(playback)} traces={answer.entries.flatMap(entry =>
        entry.playerId && entry.graphHue !== undefined && entry.graphLine ? [{
          id: entry.playerId, line: entry.graphLine, hue: entry.graphHue, name: nameOf(entry.playerId), winner: entry.place === 1,
        }] : [])} />
      <p className="graph-reveal-key">{graphText('actual')}</p>
      {answer.graph.source && <p className="mg-source-credit">{answer.graph.source}</p>}
      {(answer.graph.sourceUrl || answer.graph.sourceNote) && <details className="mg-source">
        <summary>{graphText('sourceDetails')}</summary>
        {answer.graph.sourceNote && <p>{answer.graph.sourceNote}</p>}
        {answer.graph.sourceUrl && <a className="link-button" href={answer.graph.sourceUrl} target="_blank" rel="noreferrer">{graphText('openSource')}</a>}
      </details>}
    </>}
    {answer.doorsMilli && <><h3>{t('minigame.behindDoors')}</h3><ol className="mg-doors revealed">{answer.doorsMilli.map((milli, index) =>
      <li key={index} className="mg-door">{t('minigame.door', { number: index + 1 })}<strong>{formatPoints(milli)}</strong></li>)}</ol></>}
    {answer.dotReveal ? <DotReveal pattern={answer.dotReveal.pattern} startedAt={answer.dotReveal.startedAt} offset={offset} easing={easing}>
      {standings}
    </DotReveal> : <>
      {answer.dotCount !== undefined && <p className="mg-dot-total">{c('dotTotal', { count: answer.dotCount })}</p>}
      {standings}
    </>}
    {otherAwards.length > 0 && <details className="mg-source"><summary>{t('results.points')}</summary>
      <PagedResultList className="plain-list round-awards" pageSize={PAGE_SIZE} rows={otherAwards.map(award =>
        <li key={award.playerId}><span>{nameOf(award.playerId)}</span><strong>{formatPoints(award.amountMilli)}</strong></li>)} />
    </details>}
  </div>;
}

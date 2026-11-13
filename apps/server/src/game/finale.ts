import { FINALE_STATS, SubmissionValueSchema, type FinaleStat } from '@party/contracts';
import { minigameRules, type GameDefinition } from './definition.js';
import { locateStage } from './graph.js';
import type { Transaction } from './model.js';
import { minigameOutcome } from '../minigames/outcome.js';

export interface FinaleSlide { stat: FinaleStat; playerIds: string[]; value: string }
/** The statistics shown unless the author chooses: everything that has something to show. */
export const DEFAULT_FINALE: readonly FinaleStat[] = FINALE_STATS;
const points = (milli: bigint) => { const whole = milli / 1000n; const rest = milli % 1000n; return rest === 0n ? `${whole}` : `${whole}.${String(rest).padStart(3, '0').replace(/0+$/, '')}`; };
/** The players with the highest count (ties share the slide), or null when nobody has any. */
function top(counts: Map<string, number>, lowest = false): { playerIds: string[]; value: number } | null {
  const entries = [...counts.entries()].filter(([, value]) => value > 0); if (!entries.length) return null;
  const best = entries.reduce((result, [, value]) => lowest ? Math.min(result, value) : Math.max(result, value), lowest ? Infinity : -Infinity);
  return { playerIds: entries.filter(([, value]) => value === best).map(([id]) => id), value: best };
}
const bump = (map: Map<string, number>, key: string, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

/**
 * The end-of-game show: one slide per statistic the author picked, in their
 * order, skipping statistics this game has nothing for. Computed from saved
 * answers and scores only. ("Most reactions" is added by the room, which
 * counts reactions while the server runs.)
 */
export async function finaleSlides(tx: Transaction, sessionId: string, definition: GameDefinition): Promise<FinaleSlide[]> {
  const wanted = definition.finale?.stats ?? DEFAULT_FINALE; if (!wanted.length) return [];
  const runs = await tx.stageRun.findMany({ where: { sessionId }, select: { id: true, nodeKey: true, stageKey: true, openedAt: true, lineupId: true, presentation: true } });
  const submissions = await tx.submission.findMany({ where: { sessionId, slotKey: 'answer' }, select: { id: true, stageRunId: true, playerId: true, teamId: true, value: true, receivedAt: true } });
  const scores = await tx.scoreEntry.findMany({ where: { sessionId, recipientPlayerId: { not: null } }, select: { recipientPlayerId: true, amountMilli: true, reason: true } });
  const stageOf = new Map(runs.map(run => [run.id, { run, stage: locateStage(definition, run.nodeKey, run.stageKey)?.stage }]));
  const author = new Map(submissions.map(submission => [submission.id, submission.playerId]));

  const totals = new Map<string, bigint>(); const lucky = new Map<string, bigint>();
  for (const score of scores) {
    totals.set(score.recipientPlayerId!, (totals.get(score.recipientPlayerId!) ?? 0n) + score.amountMilli);
    if (score.reason === 'Lucky door') lucky.set(score.recipientPlayerId!, (lucky.get(score.recipientPlayerId!) ?? 0n) + score.amountMilli);
  }
  const correct = new Map<string, number>(); const wrong = new Map<string, number>(); const votes = new Map<string, number>();
  const times = new Map<string, number[]>(); const firsts = new Map<string, number>();
  for (const submission of submissions) {
    const info = stageOf.get(submission.stageRunId); const value = SubmissionValueSchema.safeParse(submission.value); if (!info?.stage || !value.success) continue;
    if (value.data.kind === 'vote') { const voted = author.get(value.data.submissionId); if (voted) bump(votes, voted); }
    if (!submission.playerId || info.stage.kind !== 'collect') continue;
    const rule = info.stage.scoring;
    if (rule.kind !== 'none') {
      const right = (rule.kind === 'correct-choice' && value.data.kind === 'choice' && value.data.choiceKey === rule.correctChoiceKey)
        || (rule.kind === 'correct-order' && value.data.kind === 'order' && value.data.keys.every((key, index) => key === rule.correctOrder[index]));
      bump(right ? correct : wrong, submission.playerId);
      // Speed only counts on questions with a right answer: writing and drawing take as long as they take.
      times.set(submission.playerId, [...(times.get(submission.playerId) ?? []), submission.receivedAt.getTime() - info.run.openedAt.getTime()]);
    }
  }
  for (const { run, stage } of stageOf.values()) {
    if (stage?.kind !== 'minigame' || run.lineupId) continue;
    try { for (const entry of minigameOutcome(minigameRules(stage), submissions.filter(row => row.stageRunId === run.id), null, run.id).entries) if (entry.place === 1 && entry.playerId) bump(firsts, entry.playerId); }
    catch { /* a minigame no longer in the catalog has no champion */ }
  }
  const average = new Map([...times.entries()].filter(([, list]) => list.length >= 2).map(([id, list]) => [id, list.reduce((sum, ms) => sum + ms, 0) / list.length]));
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s on average`;
  const count = (map: Map<string, number>, unit: [string, string], lowest = false) => { const best = top(map, lowest); return best ? { playerIds: best.playerIds, value: `${best.value} ${best.value === 1 ? unit[0] : unit[1]}` } : null; };
  const bigTop = (map: Map<string, bigint>) => { const entries = [...map.entries()].filter(([, value]) => value > 0n); if (!entries.length) return null; const best = entries.reduce((result, [, value]) => value > result ? value : result, 0n); return { playerIds: entries.filter(([, value]) => value === best).map(([id]) => id), value: `${points(best)} points` }; };
  const slides: Record<FinaleStat, { playerIds: string[]; value: string } | null> = {
    winner: bigTop(totals), mostCorrect: count(correct, ['correct answer', 'correct answers']), mostWrong: count(wrong, ['wrong answer', 'wrong answers']),
    fastest: (() => { const best = top(average, true); return best ? { playerIds: best.playerIds, value: seconds(best.value) } : null; })(),
    slowest: (() => { const best = average.size >= 2 ? top(average) : null; return best ? { playerIds: best.playerIds, value: seconds(best.value) } : null; })(),
    mostVotes: count(votes, ['vote', 'votes']), minigameChamp: count(firsts, ['minigame won', 'minigames won']), luckiest: bigTop(lucky), mostReactions: null,
  };
  return wanted.flatMap(stat => { const slide = slides[stat]; return slide ? [{ stat, ...slide }] : stat === 'mostReactions' ? [{ stat, playerIds: [], value: '' }] : []; });
}

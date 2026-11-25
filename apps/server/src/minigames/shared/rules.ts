import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { CoinSideSchema, createDotPattern, isSharedPrediction, ROULETTE_POCKETS, RoulettePocketSchema, RouletteTableBetsSchema, rouletteStake } from '@party/contracts';
import { ANGLE_TARGETS, AngleSchema, ANIMATION_WORDS, chooseCutTarget, CutTargetSchema, isStepMinigame, MINIGAME_COUNTDOWN_MS, MINIGAMES, parseMinigameSettings, type MinigameKey, type MinigameSettings } from '@party/contracts';
import { GameError, requireGame } from '../../game/errors.js';
import { DotRunSchema } from '../count-the-dots/dots.js';
import { GraphRunSchema, judgeGraph, startGraph } from '../draw-the-graph/graph.js';
import { flipCoin } from '../heads-or-tails/coin.js';
import { reaction } from '../reaction/judge.js';
import { cutLine } from '../cut-the-line/judge.js';
import { matchAngle } from '../match-the-angle/judge.js';
import { countDots } from '../count-the-dots/judge.js';
import { clapBeat } from '../clap-beat/judge.js';
import { tapRace } from '../tap-race/judge.js';
import { stopClock } from '../stop-clock/judge.js';
import { perfectCircle } from '../perfect-circle/judge.js';
import { drawHangmanWord } from '../hangman/rules.js';
import { CLOCK_SLACK_MS, NO_FAIRNESS, type Fairness } from './fairness.js';
import type { ClaimedResult, JudgedResult, ResultJudge } from './judging.js';

/**
 * Stored on the stage run when play starts. `doorsMilli` is the shuffled secret
 * for lucky doors; views never show it before the reveal.
 */
// `steps`: a step game's sides ("team:<id>" or "player:<id>"): the game's own state (with its secrets), the step it is at and when it began, the side's captain (when the captain decides) and, in a team vote, when the vote ends.
export const StepSideSchema = z.object({ state: z.unknown(), step: z.number().int().min(0), stepAt: z.string().datetime(), captainId: z.string().uuid().nullable(), voteEndsAt: z.string().datetime().nullable() }).strict();
export type StepSide = z.infer<typeof StepSideSchema>;
export const MinigameRunSchema = z.object({ startsAt: z.string().datetime(), goAt: z.string().datetime().nullable(), doorsMilli: z.array(z.string()).nullable(),
  cutTarget: CutTargetSchema.optional(),
  angleTarget: AngleSchema.optional(),
  dots: DotRunSchema.optional(),
  graph: GraphRunSchema.optional(),
  coin: CoinSideSchema.optional(),
  roulette: RoulettePocketSchema.optional(),
  // Galgje: the round's secret word (only in the reveal's view once revealed).
  hangmanWord: z.string().max(30).optional(),
  steps: z.record(z.string(), StepSideSchema).optional(), raceElapsedMs: z.number().int().min(0).optional(), relayPausedAt: z.string().datetime().optional(), relayPrompts: z.array(z.number().int().min(0).max(ANIMATION_WORDS.length - 1)).length(ANIMATION_WORDS.length).optional() }).strict();
export type MinigameRun = z.infer<typeof MinigameRunSchema>;
export const readMinigameRun = (presentation: unknown): MinigameRun | null => {
  const parsed = MinigameRunSchema.safeParse((presentation as { minigame?: unknown } | null)?.minigame);
  return parsed.success ? parsed.data : null;
};

/** Starts play after the countdown and picks any round-specific targets. */
export function startMinigame(game: MinigameKey, settings: MinigameSettings, now: Date, random: (max: number) => number = randomInt, countdownMs = MINIGAME_COUNTDOWN_MS): MinigameRun {
  const startsAt = now.getTime() + countdownMs;
  if (game === 'reaction') {
    const { minWaitMs, maxWaitMs } = settings as MinigameSettings<'reaction'>;
    return { startsAt: new Date(startsAt).toISOString(), goAt: new Date(startsAt + minWaitMs + random(maxWaitMs - minWaitMs + 1)).toISOString(), doorsMilli: null };
  }
  if (game === 'lucky-doors') {
    // Fixed: door 1 hides the first value, and so on (the host decided). Else Fisher–Yates with the system's secure random numbers.
    const doors = [...(settings as MinigameSettings<'lucky-doors'>).doorsMilli];
    if ((settings as MinigameSettings<'lucky-doors'>).order !== 'fixed') for (let index = doors.length - 1; index > 0; index--) { const other = random(index + 1); [doors[index], doors[other]] = [doors[other]!, doors[index]!]; }
    return { startsAt: new Date(startsAt).toISOString(), goAt: null, doorsMilli: doors };
  }
  const run: MinigameRun = { startsAt: new Date(startsAt).toISOString(), goAt: null, doorsMilli: null };
  if (game === 'cut-the-line') run.cutTarget = chooseCutTarget(settings as MinigameSettings<'cut-the-line'>, random);
  if (game === 'match-the-angle') run.angleTarget = ANGLE_TARGETS[random(ANGLE_TARGETS.length)]!;
  if (game === 'draw-the-graph') run.graph = startGraph(settings as MinigameSettings<'draw-the-graph'>, random);
  if (game === 'heads-or-tails') run.coin = flipCoin(random);
  if (game === 'red-or-black-roulette') run.roulette = random(ROULETTE_POCKETS);
  if (game === 'hangman') run.hangmanWord = drawHangmanWord(settings as MinigameSettings<'hangman'>, random);
  if (game === 'count-the-dots') {
    const dots = settings as MinigameSettings<'count-the-dots'>;
    run.dots = { pattern: createDotPattern(random, dots), guessAt: new Date(startsAt + dots.viewSeconds * 1000).toISOString() };
  }
  if (game === 'relay-drawing' && (settings as MinigameSettings<'relay-drawing'>).animation) {
    const prompts = ANIMATION_WORDS.map((_, index) => index);
    for (let index = prompts.length - 1; index > 0; index--) {
      const other = random(index + 1);
      [prompts[index], prompts[other]] = [prompts[other]!, prompts[index]!];
    }
    run.relayPrompts = prompts;
  }
  return run;
}

const judges: Partial<Record<MinigameKey, ResultJudge>> = {
  'cut-the-line': cutLine,
  'match-the-angle': matchAngle,
  'count-the-dots': countDots,
  'draw-the-graph': judgeGraph,
  'clap-beat': clapBeat,
  'tap-race': tapRace,
  'stop-clock': stopClock,
  'perfect-circle': perfectCircle,
};

/**
 * Judges a result: refuses what could not have happened, and adjusts what the
 * network says is too good. A phone measures its own play (fair on slow
 * connections), but it cannot claim to have acted earlier than its result's
 * arrival allows, nor to have tapped more than the server saw. A modified
 * phone can therefore gain at most about one network round trip.
 * Returns the result to store.
 */
export function judgeResult(game: MinigameKey, settings: MinigameSettings, run: MinigameRun, value: ClaimedResult, now: Date, fair: Fairness = NO_FAIRNESS): JudgedResult {
  const started = Date.parse(run.startsAt);
  const at = now.getTime();
  requireGame(at >= started - CLOCK_SLACK_MS, 'INVALID_SUBMISSION');
  const input = { settings, run, value, at, started, fair };
  if (game === 'reaction') return reaction(input);
  requireGame(!value.early, 'INVALID_SUBMISSION');
  if (game === 'red-or-black-roulette') {
    // Bets on the table; the value is their total stake (checked against the player's points when it is saved).
    const bets = RouletteTableBetsSchema.safeParse(value.bets);
    requireGame(at >= started && run.roulette !== undefined && bets.success, 'INVALID_SUBMISSION');
    return { value: rouletteStake(bets.data), bets: bets.data };
  }
  if (isSharedPrediction(game)) {
    requireGame(at >= started && run.coin !== undefined && (value.value === 0 || value.value === 1), 'INVALID_SUBMISSION');
    return { value: value.value };
  }
  const judge = judges[game];
  if (judge) return judge(input);
  if (game === 'relay-drawing') { requireGame(value.teamId !== undefined, 'INVALID_SUBMISSION'); return { value: 0, teamId: value.teamId }; }
  // Step games are played move by move (minigame.move); their result is written by the server when a side is done.
  requireGame(!isStepMinigame(game), 'INVALID_SUBMISSION');
  throw new GameError('INVALID_SUBMISSION');
}

/** A number to rank by (lower is better), or null when the result does not rank (false start). */
export function rankValue(game: MinigameKey, settings: MinigameSettings, value: { value: number; early?: true | undefined }): number | null {
  // Pass the pencil is ranked by its votes (see minigameOutcome), not by one result per player.
  if (value.early || game === 'relay-drawing') return null;
  // Stop the clock keeps the stopped time as its result; it ranks by the distance from the target.
  if (game === 'stop-clock') return Math.abs(value.value - (settings as MinigameSettings<'stop-clock'>).targetMs);
  const { better } = MINIGAMES[game];
  return better === 'lower' ? value.value : better === 'higher' ? -value.value : null;
}

/** Places for ranked results: entries that tie on both criteria share a place. */
export function places<T>(entries: T[], score: (entry: T) => number | null, tiebreak?: (entry: T) => number): Map<T, number> {
  const compare = (a: T, b: T) => score(a)! - score(b)! || (tiebreak ? tiebreak(a) - tiebreak(b) : 0);
  const ranked = entries.filter(entry => score(entry) !== null).sort(compare);
  const result = new Map<T, number>();
  ranked.forEach((entry, index) => { const previous = ranked[index - 1]; result.set(entry, previous !== undefined && compare(previous, entry) === 0 ? result.get(previous)! : index + 1); });
  return result;
}

/** A team's result from its members' results: best, average (rounded) or total. Total only makes sense when higher is better. */
export function teamValue(game: MinigameKey, rule: 'best' | 'average' | 'total', values: number[]): number | null {
  if (!values.length) return null;
  if (rule === 'best') return Math.min(...values);
  if (rule === 'total' && MINIGAMES[game].better === 'higher') return values.reduce((sum, value) => sum + value, 0);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export { parseMinigameSettings };

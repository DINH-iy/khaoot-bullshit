import { randomInt } from 'node:crypto';
import { BALL_RADIUS, canPlacePoolCue, DEFAULT_POOL_SHOT_SECONDS, DEFAULT_POOL_START, oppositePoolPocket, POOL_HEIGHT, POOL_MAX_SHOTS, POOL_WIDTH,
  poolGroup, poolLegalTarget, isLegalPoolContact, poolPositionClear, poolStartX, rackPool, shootPool, type PoolImpact, type HeadToHeadView, type PoolBallBehavior, type PoolFelt, type PoolFrame, type ResolvedPoolStart } from '@party/contracts';
import { illegal, type HeadToHeadRules, type Seat } from '../engine.js';

interface Pool {
  frames: PoolFrame[];
  motion: PoolFrame[];
  impacts?: PoolImpact[];
  turn: Seat;
  solids: Seat | null;
  ballInHand: boolean;
  foul: boolean;
  winner: Seat | null;
  ending: Extract<HeadToHeadView['board'], { game: 'eight-ball' }>['ending'];
  lastPocket: { solid: number | null; stripe: number | null };
  pots?: [number, number];
  scratches?: [number, number];
  timedOut?: true;
  ballBehavior?: PoolBallBehavior;
  start?: ResolvedPoolStart;
  felt?: PoolFelt;
  /** Seconds per shot (absent or 0: no shot clock) and when the current turn's clock started (ms since epoch). */
  shotSeconds?: number;
  turnFrom?: number;
  shotTimedOut?: boolean;
  potsBySeat?: [number[], number[]];
}

const other = (seat: Seat): Seat => seat === 0 ? 1 : 0;
// Phones show a shot's balls rolling for up to 4.6 s; the next shooter's clock starts once they settle.
const PLAYBACK_MS = (frames: number) => Math.min(1000 / 15 * Math.max(0, frames - 1), 4600) + 800;
/** A claim may arrive a moment before the server's own clock says time is up. */
const CLAIM_TOLERANCE_MS = 250;
const clockFor = (data: Pool, from: number) => data.shotSeconds ? { turnFrom: from } : {};
const current = (data: Pool) => data.frames.at(-1)!;
const atLimit = (data: Pool) => data.frames.length > POOL_MAX_SHOTS;

function pottedBallsBySeat(data: Pool): [number[], number[]] {
  const [a, b] = data.potsBySeat ?? [[], []];
  // Older saves recorded the break-shot 8 even though it was returned to play.
  const eightPottedBy = data.ending && data.winner !== null
    ? data.ending === 'clean' ? data.winner : other(data.winner)
    : null;
  return [eightPottedBy === 0 ? a : a.filter(id => id !== 8), eightPottedBy === 1 ? b : b.filter(id => id !== 8)];
}

function spot(balls: PoolFrame, id: 0 | 8, start: ResolvedPoolStart): PoolFrame {
  const fromEdge = (x: number) => start.side === 'right' ? POOL_WIDTH - x : x;
  const preferred = id === 0 ? poolStartX(start) : fromEdge(550);
  const limit = id === 0 ? fromEdge(preferred) : POOL_WIDTH - BALL_RADIUS;
  if (poolPositionClear(preferred, 200, balls)) return [[id, preferred, 200], ...balls];
  for (let y = BALL_RADIUS * 3; y < POOL_HEIGHT - BALL_RADIUS; y += BALL_RADIUS * 2) {
    for (let x = BALL_RADIUS * 3; x <= limit; x += BALL_RADIUS * 2) {
      if (poolPositionClear(fromEdge(x), y, balls)) return [[id, fromEdge(x), y], ...balls];
    }
  }
  throw new Error('Pool table has no open placement');
}

const groupFor = (data: Pool, seat: Seat) => data.solids === null ? null : data.solids === seat ? 'solid' : 'stripe';
function targetPocket(data: Pool, seat: Seat) {
  const own = groupFor(data, seat);
  if (!own || current(data).some(([id]) => poolGroup(id) === own)) return null;
  const last = data.lastPocket[own];
  return last === null ? null : oppositePoolPocket(last);
}

/** Start the opening shot clock when an invitation is accepted, retaining the original rack. */
export function startPoolShotClock(data: unknown): Pool {
  const pool = data as Pool;
  return { ...pool, ...clockFor(pool, Date.now()) };
}

export function poolTimedOut(data: unknown) {
  return (data as Pool).timedOut === true;
}

export function finishPoolOnTime(data: unknown): Pool {
  const match = data as Pool;
  const [a, b] = match.pots ?? [0, 0];
  const [aScratches, bScratches] = match.scratches ?? [0, 0];
  const bothOnEight = !current(match).some(([id]) => poolGroup(id) !== null);
  const difference = bothOnEight ? bScratches - aScratches : a - b;
  return { ...match, timedOut: true, winner: difference > 0 ? 0 : difference < 0 ? 1 : null };
}

export function settlePoolTie(data: unknown, winner: Seat): Pool {
  const match = data as Pool;
  illegal(match.timedOut && match.winner === null, 'There is no pool tie to settle');
  return { ...match, winner };
}

export const eightBall: HeadToHeadRules<'eight-ball', Pool> = {
  start: settings => {
    const side = settings.start?.side ?? DEFAULT_POOL_START.side;
    const start: ResolvedPoolStart = { side: side === 'random' ? (randomInt(2) === 0 ? 'left' : 'right') : side,
      percent: settings.start?.percent ?? DEFAULT_POOL_START.percent };
    return { frames: [rackPool(start)], motion: [], turn: 0, solids: null, ballInHand: false, foul: false, winner: null, start,
      ending: null, lastPocket: { solid: null, stripe: null }, ...(settings.ballBehavior ? { ballBehavior: settings.ballBehavior } : {}),
      ...(settings.felt ? { felt: settings.felt } : {}),
      ...((settings.shotSeconds ?? DEFAULT_POOL_SHOT_SECONDS) > 0 ? { shotSeconds: settings.shotSeconds ?? DEFAULT_POOL_SHOT_SECONDS, turnFrom: Date.now() } : {}) };
  },
  turn: data => data.winner !== null || data.timedOut || atLimit(data) ? null : data.turn,
  apply(data, seat, move) {
    if ('timeout' in move) {
      // Either player's phone reports the shooter's time is up; the server decides by its own clock.
      illegal(eightBall.turn(data) !== null, 'The game is over');
      illegal(move.shot === data.frames.length - 1, 'That shot has already been played');
      const deadline = data.shotSeconds && data.turnFrom !== undefined ? data.turnFrom + data.shotSeconds * 1000 : null;
      illegal(deadline !== null && Date.now() >= deadline - CLAIM_TOLERANCE_MS, 'There is still time for this shot');
      const turn = other(data.turn);
      // Time up on the break: the other player breaks instead, from the same rack.
      if (data.frames.length === 1) return { ...data, turn, turnFrom: Date.now(), shotTimedOut: true };
      const balls = spot(current(data).filter(([id]) => id !== 0), 0, data.start ?? DEFAULT_POOL_START);
      return { ...data, frames: [...data.frames, balls], motion: [], impacts: [], foul: true, ballInHand: true, turn, turnFrom: Date.now(), shotTimedOut: true };
    }
    illegal(eightBall.turn(data) === seat, 'Not your turn');
    illegal(move.shot === data.frames.length - 1, 'That shot has already been played');
    const before = current(data);
    const startArea = data.start ?? DEFAULT_POOL_START;
    const placement = move.cue;
    illegal(!placement || (data.ballInHand && canPlacePoolCue(...placement, before, startArea)), 'The cue ball cannot be placed there');
    const start = placement ? before.map((ball): PoolFrame[number] => ball[0] === 0 ? [0, ...placement] : ball) : before;
    const opening = data.frames.length === 1;
    const shot = shootPool(start, move.angle, move.power, data.ballBehavior, move.spin, opening);
    const own = groupFor(data, seat);
    const legalTarget = poolLegalTarget(before, own, opening);
    const onEight = legalTarget === 'eight';
    const target = targetPocket(data, seat);
    const hit = shot.firstHit;
    const scratch = shot.pocketed.some(({ id }) => id === 0);
    const foul = scratch || hit === null || !isLegalPoolContact(legalTarget, hit);
    const eight = shot.pocketed.find(({ id }) => id === 8);
    const ending = eight && !opening ? (scratch ? 'scratch' : !onEight ? 'early' : foul ? 'foul'
      : target !== null && eight.pocket !== target ? 'wrong-pocket' : 'clean') : null;
    const winner = ending === null ? null : ending === 'clean' ? seat : other(seat);
    const group = shot.pocketed.map(({ id }) => poolGroup(id)).find(value => value !== null);
    const solids = data.solids ?? (!opening && !foul && group ? (group === 'solid' ? seat : other(seat)) : null);
    const keepTurn = !foul && (own ? shot.pocketed.some(({ id }) => poolGroup(id) === own) : Boolean(group));
    const lastPocket = { ...data.lastPocket };
    for (const { id, pocket } of shot.pocketed) {
      const sunk = poolGroup(id);
      if (sunk) lastPocket[sunk] = pocket;
    }
    let balls = shot.balls;
    if (eight && opening) balls = spot(balls, 8, startArea);
    if (foul && winner === null) balls = spot(balls.filter(([id]) => id !== 0), 0, startArea);
    const pots: [number, number] = [...(data.pots ?? [0, 0])];
    const scratches: [number, number] = [...(data.scratches ?? [0, 0])];
    if (!opening && !foul) pots[seat] += shot.pocketed.filter(({ id }) => poolGroup(id) !== null).length;
    if (scratch) scratches[seat]++;
    const potsBySeat = pottedBallsBySeat(data);
    const keptPots = shot.pocketed.filter(({ id }) => id !== 0 && !(opening && id === 8));
    potsBySeat[seat] = [...new Set([...potsBySeat[seat], ...keptPots.map(({ id }) => id)])];
    return { ...data, frames: [...data.frames, balls], motion: shot.motion, impacts: shot.impacts, winner, ending, solids, foul, lastPocket, pots, scratches, potsBySeat,
      ...clockFor(data, Date.now() + PLAYBACK_MS(shot.motion.length)), shotTimedOut: false,
      ballInHand: foul && winner === null, turn: keepTurn ? seat : other(seat) };
  },
  outcome: data => data.winner === null ? (data.timedOut || atLimit(data) ? { kind: 'draw' } : null) : { kind: 'win', seat: data.winner, reason: 'played' },
  board: data => ({ game: 'eight-ball', balls: current(data), motion: data.motion, solids: data.solids,
    ballInHand: data.ballInHand, foul: data.foul, shot: data.frames.length - 1,
    ...(data.ballBehavior ? { ballBehavior: data.ballBehavior } : {}), ...(data.impacts ? { impacts: data.impacts } : {}),
    start: data.start ?? DEFAULT_POOL_START, ...(data.felt ? { felt: data.felt } : {}),
    ...(data.shotSeconds && data.turnFrom !== undefined && !eightBall.outcome(data) && !data.timedOut ? { shotClock: {
      seconds: data.shotSeconds, leftMs: Math.round(Math.max(0, Math.min(70_000, data.turnFrom + data.shotSeconds * 1000 - Date.now()))) } } : {}),
    ...(data.shotTimedOut ? { shotTimedOut: true } : {}), potsBySeat: pottedBallsBySeat(data),
    eightPocket: eightBall.outcome(data) ? null : targetPocket(data, data.turn), ending: data.ending }),
  replay: data => ({ game: 'eight-ball', frames: data.frames, ...(data.felt ? { felt: data.felt } : {}) }),
};

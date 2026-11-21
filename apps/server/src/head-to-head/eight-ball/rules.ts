import { BALL_RADIUS, canPlacePoolCue, oppositePoolPocket, POOL_HEIGHT, POOL_MAX_SHOTS, POOL_START_LINE, POOL_WIDTH,
  poolGroup, poolPositionClear, type HeadToHeadView, type PoolFrame } from '@party/contracts';
import { illegal, type HeadToHeadRules, type Seat } from '../engine.js';
import { rackPool, shootPool } from './physics.js';

interface Pool {
  frames: PoolFrame[];
  motion: PoolFrame[];
  turn: Seat;
  solids: Seat | null;
  ballInHand: boolean;
  foul: boolean;
  winner: Seat | null;
  ending: Extract<HeadToHeadView['board'], { game: 'eight-ball' }>['ending'];
  lastPocket: { solid: number | null; stripe: number | null };
}

const other = (seat: Seat): Seat => seat === 0 ? 1 : 0;
const current = (data: Pool) => data.frames.at(-1)!;
const atLimit = (data: Pool) => data.frames.length > POOL_MAX_SHOTS;

function spot(balls: PoolFrame, id: 0 | 8): PoolFrame {
  const preferred = id === 0 ? POOL_START_LINE : 550;
  const limit = id === 0 ? POOL_START_LINE : POOL_WIDTH - BALL_RADIUS;
  if (poolPositionClear(preferred, 200, balls)) return [[id, preferred, 200], ...balls];
  for (let y = BALL_RADIUS * 3; y < POOL_HEIGHT - BALL_RADIUS; y += BALL_RADIUS * 2) {
    for (let x = BALL_RADIUS * 3; x <= limit; x += BALL_RADIUS * 2) {
      if (poolPositionClear(x, y, balls)) return [[id, x, y], ...balls];
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

export const eightBall: HeadToHeadRules<'eight-ball', Pool> = {
  start: () => ({ frames: [rackPool()], motion: [], turn: 0, solids: null, ballInHand: false, foul: false, winner: null,
    ending: null, lastPocket: { solid: null, stripe: null } }),
  turn: data => data.winner !== null || atLimit(data) ? null : data.turn,
  apply(data, seat, move) {
    illegal(eightBall.turn(data) === seat, 'Not your turn');
    illegal(move.shot === data.frames.length - 1, 'That shot has already been played');
    const before = current(data);
    const placement = move.cue;
    illegal(!placement || (data.ballInHand && canPlacePoolCue(...placement, before)), 'The cue ball cannot be placed there');
    const start = placement ? before.map((ball): PoolFrame[number] => ball[0] === 0 ? [0, ...placement] : ball) : before;
    const shot = shootPool(start, move.angle, move.power);
    const opening = data.frames.length === 1;
    const own = groupFor(data, seat);
    const onEight = !before.some(([id]) => own === null ? poolGroup(id) !== null : poolGroup(id) === own);
    const target = targetPocket(data, seat);
    const hit = shot.firstHit;
    const scratch = shot.pocketed.some(({ id }) => id === 0);
    const foul = scratch || hit === null || (!opening && (onEight ? hit !== 8 : hit === 8 || (own !== null && poolGroup(hit) !== own)));
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
    if (eight && opening) balls = spot(balls, 8);
    if (foul && winner === null) balls = spot(balls.filter(([id]) => id !== 0), 0);
    return { frames: [...data.frames, balls], motion: shot.motion, winner, ending, solids, foul, lastPocket,
      ballInHand: foul && winner === null, turn: keepTurn ? seat : other(seat) };
  },
  outcome: data => data.winner === null ? (atLimit(data) ? { kind: 'draw' } : null) : { kind: 'win', seat: data.winner, reason: 'played' },
  board: data => ({ game: 'eight-ball', balls: current(data), motion: data.motion, solids: data.solids,
    ballInHand: data.ballInHand, foul: data.foul, shot: data.frames.length - 1,
    eightPocket: eightBall.outcome(data) ? null : targetPocket(data, data.turn), ending: data.ending }),
  replay: data => ({ game: 'eight-ball', frames: data.frames }),
};

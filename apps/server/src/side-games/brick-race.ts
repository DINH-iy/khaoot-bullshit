import { BRICK_MAX_SECONDS, BrickChallengeViewSchema, BrickRaceSettingsSchema, MINIGAME_COUNTDOWN_MS, brickMap, type BrickChallengeView, type HeadToHeadOutcome } from '@party/contracts';
import { roomAssert } from '../rooms/security.js';
import { verifiedBrickClear } from '../minigames/brick-rally/judge.js';

const BrickRaceSchema = BrickChallengeViewSchema.omit({ seat: true });
type BrickRace = ReturnType<typeof BrickRaceSchema.parse>;
type Racer = BrickChallengeView['seat'];

export function newBrickRace(settings: unknown): BrickRace | null {
  const parsed = BrickRaceSettingsSchema.safeParse(settings ?? {});
  if (!parsed.success) return null;
  const { lives, timerSeconds } = parsed.data;
  return { map: [...brickMap(parsed.data)], ...(lives === undefined ? {} : { lives }), ...(timerSeconds === undefined ? {} : { timerSeconds }),
    ready: [false, false], startsAt: null, deadlineAt: null, times: [null, null], outcome: null };
}

export function readBrickRace(raw: unknown): BrickRace {
  const parsed = BrickRaceSchema.safeParse(raw);
  roomAssert(parsed.success, 'INVALID_STATE');
  return parsed.data;
}

export function brickRaceView(race: BrickRace, seat: Racer): BrickChallengeView {
  return {
    ...race, seat,
    times: race.outcome ? race.times : [seat === 0 ? race.times[0] : null, seat === 1 ? race.times[1] : null],
  };
}

export function readyBrickRace(race: BrickRace, seat: Racer, now: number) {
  race.ready[seat] = true;
  if (!race.startsAt && race.ready.every(Boolean)) {
    const start = now + MINIGAME_COUNTDOWN_MS;
    race.startsAt = new Date(start).toISOString();
    race.deadlineAt = new Date(start + (race.timerSeconds ?? BRICK_MAX_SECONDS) * 1000).toISOString();
  }
}

export function submitBrickRaceClear(race: BrickRace, seat: Racer, brickTrace: string, now: number) {
  roomAssert(race.startsAt, 'INVALID_STATE');
  if (race.times[seat] !== null) return;
  const elapsed = verifiedBrickClear(race.map, brickTrace, now - Date.parse(race.startsAt), race.lives);
  roomAssert(elapsed !== null, 'INVALID_SUBMISSION');
  race.times[seat] = elapsed;
}

export function brickRaceOutcome(race: BrickRace, now: number): HeadToHeadOutcome | null {
  const [first, second] = race.times;
  if ((first === null || second === null) && (!race.deadlineAt || now < Date.parse(race.deadlineAt))) return null;
  if (first === second) return { kind: 'draw' };
  return { kind: 'win', seat: second === null || (first !== null && first < second) ? 0 : 1, reason: 'played' };
}

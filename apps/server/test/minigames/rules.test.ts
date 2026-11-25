import { describe, expect, it } from 'vitest';
import { ANGLE_TARGETS, DOT_RADIUS, DotPatternSchema, DotSettingsSchema, MINIGAMES, minigameScoring, minigameTiebreak, ROULETTE_OUTSIDE, ROULETTE_POCKETS, ROULETTE_ORDER, rouletteBetLimit, rouletteColor, rouletteMatches, rouletteNet, rouletteReturn } from '@party/contracts';
import { judgeResult, places, rankValue, startMinigame, teamValue } from '../../src/minigames/shared/rules.js';
import { FASTEST_REACTION_MS } from '../../src/minigames/reaction/judge.js';
import { TAP_TAIL } from '../../src/minigames/tap-race/judge.js';
import { networkAllowance } from '../../src/minigames/shared/fairness.js';
import { createLiveSignals } from '../../src/minigames/tap-race/live.js';
import { minigameOutcome, type MinigameRules } from '../../src/minigames/shared/outcome.js';
import { closenessPoints } from '../../src/minigames/shared/closeness.js';
import { GameError } from '../../src/game/errors.js';
import type { TeamContext } from '../../src/game/teams/teams.js';

const now = new Date('2026-11-13T10:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);
const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004'] as const;
const row = (playerId: string, value: number, early?: true) => ({ playerId, teamId: null, value: { kind: 'minigame', value, ...(early ? { early } : {}) } });
const rules = (game: MinigameRules['game'], extra: Partial<MinigameRules> = {}): MinigameRules => ({ game, settings: MINIGAMES[game].defaults, placementMilli: ['10000', '6000', '3000'], teamResult: 'average', tiebreak: minigameTiebreak(game), ...extra });
const rejected = (run: () => void) => { try { run(); } catch (error) { return error instanceof GameError && error.code === 'INVALID_SUBMISSION'; } return false; };

describe('minigame rules', () => {
  it('uses the numbered European wheel and pays exact picks including green zero', () => {
    expect(new Set(ROULETTE_ORDER).size).toBe(37);
    expect(rouletteColor(32)).toBe('red');
    expect(rouletteColor(11)).toBe('black');
    expect(rouletteReturn(0, 0, 10)).toBe(360);
    expect(rouletteReturn(0, 'red', 10)).toBe(0);
    expect(rouletteReturn(32, 32, 25)).toBe(900);
    expect(rouletteReturn(32, 'red', 25)).toBe(50);
  });

  it('covers the usual pockets with every outside bet, and green zero loses them all', () => {
    const covered = (pick: typeof ROULETTE_OUTSIDE[number]) => Array.from({ length: ROULETTE_POCKETS }, (_, pocket) => pocket).filter(pocket => rouletteMatches(pocket, pick));
    for (const pick of ['red', 'black', 'odd', 'even', 'low', 'high'] as const) expect(covered(pick), pick).toHaveLength(18);
    for (const pick of ['dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'] as const) expect(covered(pick), pick).toHaveLength(12);
    expect(covered('dozen2')).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    expect(covered('column1')).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
    expect(ROULETTE_OUTSIDE.filter(pick => rouletteMatches(0, pick))).toEqual([]);
    // Payouts include the stake: a dozen pays 2 to 1, an even-money bet 1 to 1, a number 35 to 1.
    expect(rouletteReturn(14, 'dozen2', 10)).toBe(30);
    expect(rouletteReturn(14, 'even', 10)).toBe(20);
    expect(rouletteNet(17, [{ guess: 17, bet: 5 }, { guess: 'red', bet: 10 }])).toBe(175 - 10);
    expect(rouletteNet(0, [{ guess: 'red', bet: 10 }, { guess: 'odd', bet: 5 }])).toBe(-15);
  });

  it('lets a player bet their score, or the minimum stake when their score is lower', () => {
    expect(rouletteBetLimit(250)).toBe(250);
    expect(rouletteBetLimit(20)).toBe(100);
    expect(rouletteBetLimit(-40, 30)).toBe(30);
    expect(rouletteBetLimit(12.9, 0)).toBe(12);
  });

  it('accepts roulette bets once the spin is chosen and stores their total stake', () => {
    const game = 'red-or-black-roulette';
    const run = startMinigame(game, {}, now, () => 7);
    const bets = [{ guess: 7, bet: 5 }, { guess: 'black' as const, bet: 20 }];
    expect(judgeResult(game, {}, run, { value: 0, bets }, at(3000))).toEqual({ value: 25, bets });
    expect(rejected(() => judgeResult(game, {}, run, { value: 1 }, at(3000)))).toBe(true);
    expect(rejected(() => judgeResult(game, {}, run, { value: 0, bets: [{ guess: 'red', bet: 5 }, { guess: 'red', bet: 5 }] }, at(3000)))).toBe(true);
    expect(rejected(() => judgeResult(game, {}, run, { value: 0, bets: [{ guess: 'blue' as never, bet: 5 }] }, at(3000)))).toBe(true);
    expect(rejected(() => judgeResult(game, {}, run, { value: 0, bets }, at(1000)))).toBe(true);
  });

  it('pays each player what their roulette bets win and takes what they lose', () => {
    const game = 'red-or-black-roulette';
    const bet = (playerId: string, bets: { guess: number | string; bet: number }[]) => ({ playerId, teamId: null, value: { kind: 'minigame', value: bets.reduce((sum, entry) => sum + entry.bet, 0), bets } });
    const rows = [
      bet(ids[0], [{ guess: 14, bet: 10 }]), // straight up: +350
      bet(ids[1], [{ guess: 'black', bet: 20 }, { guess: 'dozen1', bet: 5 }]), // 14 is red and in 13–24: -20 - 5
      bet(ids[2], [{ guess: 'even', bet: 0 }]), // a free pick that wins: no points
      row(ids[3], 1), // from before the table: a free pick of black
    ];
    const run = startMinigame(game, {}, now, () => 14);
    expect(run.roulette).toBe(14);
    const result = minigameOutcome(rules(game, { placementMilli: ['4000'] }), rows, null, 'stage', run);
    expect(result.awards.map(award => [award.playerId, award.amountMilli, award.reason])).toEqual([
      [ids[0], 350_000n, 'Roulette win'], [ids[1], -25_000n, 'Roulette loss'],
    ]);
    expect(result.entries.map(entry => [entry.playerId, entry.place, entry.value])).toEqual([
      [ids[0], 1, 10], [ids[2], 1, 0], [ids[1], null, 25], [ids[3], null, 0],
    ]);
    // Green zero: only a bet on 0 wins.
    const zero = minigameOutcome(rules(game), [bet(ids[0], [{ guess: 0, bet: 2 }, { guess: 'red', bet: 3 }])], null, 'stage', startMinigame(game, {}, now, () => 0));
    expect(zero.awards.map(award => award.amountMilli)).toEqual([(72n - 5n) * 1000n]);
  });

  it('skips easy targets all the way around the circle and accepts 360° as 0°', () => {
    expect(ANGLE_TARGETS).toContain(17);
    expect(ANGLE_TARGETS).not.toContain(355);
    for (const target of ANGLE_TARGETS) {
      for (const step of [30, 45]) {
        const nearest = Math.round(target / step) * step;
        expect(Math.abs(nearest - target)).toBeGreaterThan(5);
      }
    }
    const run = startMinigame('match-the-angle', {}, now, () => 0);
    // Tenths of a degree: a full turn (3600) is 0°, and 0.5° counts as 5.
    expect(judgeResult('match-the-angle', {}, run, { value: 3600 }, at(3000))).toEqual({ angle: 0, value: 60 });
    expect(judgeResult('match-the-angle', {}, run, { value: 65 }, at(3000))).toEqual({ angle: 65, value: 5 });
    expect(() => judgeResult('match-the-angle', {}, run, { value: 3601 }, at(3000))).toThrow();
    const cut = startMinigame('cut-the-line', { target: { mode: 'exact', value: 37 } }, now);
    expect(judgeResult('cut-the-line', {}, cut, { value: 373 }, at(3000))).toEqual({ cut: 373, value: 3 });
    expect(() => judgeResult('cut-the-line', {}, cut, { value: 1001 }, at(3000))).toThrow();
  });

  it('starts after a countdown, hides GO between the set waits and shuffles every door', () => {
    const reaction = startMinigame('reaction', { minWaitMs: 2000, maxWaitMs: 6000 }, now, max => max - 1);
    expect(reaction.startsAt).toBe(at(3000).toISOString());
    expect(reaction.goAt).toBe(at(3000 + 6000).toISOString());
    expect(startMinigame('reaction', { minWaitMs: 2000, maxWaitMs: 6000 }, now, () => 0).goAt).toBe(at(5000).toISOString());
    const doors = startMinigame('lucky-doors', { doorsMilli: ['0', '5000', '10000'] }, now, () => 0);
    expect([...doors.doorsMilli!].sort()).toEqual(['0', '10000', '5000']);
  });

  it('refuses results that could not have happened', () => {
    const reaction = startMinigame('reaction', { minWaitMs: 2000, maxWaitMs: 2000 }, now, () => 0); // GO at +5 s
    expect(rejected(() => judgeResult('reaction', MINIGAMES.reaction.defaults, reaction, { value: FASTEST_REACTION_MS - 1 }, at(6000)))).toBe(true);
    const race = startMinigame('tap-race', { seconds: 10 }, now);
    expect(judgeResult('tap-race', { seconds: 10 }, race, { value: 400 }, at(13000))).toEqual({ value: 400 }); // no tap-rate limit
    expect(rejected(() => judgeResult('tap-race', { seconds: 10 }, race, { value: 80 }, at(5000)))).toBe(true); // race not over
    expect(rejected(() => judgeResult('tap-race', { seconds: 10 }, race, { value: 80, early: true }, at(13000)))).toBe(true);
    const doors = startMinigame('lucky-doors', { doorsMilli: ['0', '5000'] }, now);
    expect(rejected(() => judgeResult('lucky-doors', { doorsMilli: ['0', '5000'] }, doors, { value: 2 }, at(4000)))).toBe(true);
    expect(rejected(() => judgeResult('stop-clock', { targetMs: 10000, visibleMs: 3000 }, startMinigame('stop-clock', { targetMs: 10000, visibleMs: 3000 }, now), { value: 9000 }, at(8000)))).toBe(true);
  });

  it('treats any tap before GO as a false start: GO is never known in advance', () => {
    const reaction = startMinigame('reaction', { minWaitMs: 2000, maxWaitMs: 2000 }, now, () => 0); // GO at +5 s
    expect(judgeResult('reaction', MINIGAMES.reaction.defaults, reaction, { value: 250 }, at(4900))).toEqual({ value: 0, early: true });
    expect(judgeResult('reaction', MINIGAMES.reaction.defaults, reaction, { value: 0, early: true }, at(4000))).toEqual({ value: 0, early: true });
  });

  it('never believes a phone that claims to be quicker than its network allows', () => {
    const reaction = startMinigame('reaction', { minWaitMs: 2000, maxWaitMs: 2000 }, now, () => 0); // GO at +5 s
    const fair = { latencyMs: 100, taps: { seen: null, streamed: false } }; // allowance 280 ms
    expect(networkAllowance(100)).toBe(280);
    // Honest: tapped after 300 ms, arriving 100 ms later.
    expect(judgeResult('reaction', MINIGAMES.reaction.defaults, reaction, { value: 300 }, at(5400), fair)).toEqual({ value: 300 });
    // Lying: claims 90 ms but the tap arrived 900 ms after GO.
    expect(judgeResult('reaction', MINIGAMES.reaction.defaults, reaction, { value: 90 }, at(5900), fair)).toEqual({ value: 620 });
    // Faking a slow connection buys at most 600 ms.
    expect(networkAllowance(5000)).toBe(600);
    // Stop the clock: the stop cannot be claimed earlier than its arrival allows, nor later than it arrived.
    const clock = startMinigame('stop-clock', { targetMs: 10000, visibleMs: 3000 }, now); // starts at +3 s
    expect(judgeResult('stop-clock', { targetMs: 10000, visibleMs: 3000 }, clock, { value: 10_000 }, at(14_000), fair)).toEqual({ value: 10_720 });
    expect(judgeResult('stop-clock', { targetMs: 10000, visibleMs: 3000 }, clock, { value: 9_950 }, at(13_050), fair)).toEqual({ value: 9_950 });
  });

  it('counts only the taps the server saw during a race (plus the last few in flight)', () => {
    let time = now.getTime(); const live = createLiveSignals(() => time);
    const race = startMinigame('tap-race', { seconds: 10 }, now); // runs from +3 s to +13 s
    const report = (playerId: string, count: number, ms: number) => { time = now.getTime() + ms; return live.recordTaps('race', race.startsAt, 10, playerId, count); };
    expect(report(ids[0], 5, 1000)).toBeNull(); // before the start
    expect(report(ids[0], 10, 4000)).toBe(10);
    expect(report(ids[0], 50, 5000)).toBe(50); // no limit on how fast anyone taps
    expect(report(ids[0], 20, 6000)).toBe(50); // never goes down
    expect(report(ids[0], 60, 14_000)).toBe(60);
    expect(report(ids[0], 70, 15_000)).toBeNull(); // the race is long over
    const fair = (playerId: string) => ({ latencyMs: 50, taps: live.signals.taps('race', race.startsAt, playerId) });
    expect(judgeResult('tap-race', { seconds: 10 }, race, { value: 150 }, at(13_500), fair(ids[0]))).toEqual({ value: 60 + TAP_TAIL });
    // A phone that never reported during a followed race keeps only the last handful.
    expect(judgeResult('tap-race', { seconds: 10 }, race, { value: 100 }, at(13_500), fair(ids[1]))).toEqual({ value: TAP_TAIL });
    // A new start (after a pause) forgets the earlier counts.
    expect(live.signals.taps('race', new Date(now.getTime() + 60_000).toISOString(), ids[0])).toEqual({ seen: null, streamed: false });
  });

  it('shares places on a tie (1, 1, 3) and gives no place to a false start', () => {
    const scores = new Map([['a', 200], ['b', 200], ['c', 300], ['d', null]]);
    const placed = places([...scores.keys()], key => scores.get(key)!);
    expect([...placed.entries()]).toEqual([['a', 1], ['b', 1], ['c', 3]]);
  });

  it('gives placement points to the fastest, closest or busiest players, including shared points on a tie', () => {
    const reaction = minigameOutcome(rules('reaction'), [row(ids[0], 300), row(ids[1], 250), row(ids[2], 0, true), row(ids[3], 250)], null, ids[0]);
    expect(reaction.entries.map(entry => [entry.playerId, entry.place])).toEqual([[ids[1], 1], [ids[3], 1], [ids[0], 3], [ids[2], null]]);
    expect(reaction.awards.map(award => [award.playerId, award.amountMilli])).toEqual([[ids[0], 3000n], [ids[1], 10000n], [ids[3], 10000n]]);
    const race = minigameOutcome(rules('tap-race'), [row(ids[0], 40), row(ids[1], 70)], null, ids[0]);
    expect(race.entries[0]).toMatchObject({ playerId: ids[1], place: 1, value: 70 });
    const clock = minigameOutcome(rules('stop-clock'), [row(ids[0], 10_400), row(ids[1], 9_800)], null, ids[0]);
    expect(clock.entries[0]).toMatchObject({ playerId: ids[1], place: 1 });
    // Lucky doors pay per door when chosen, not by place.
    expect(minigameOutcome(rules('lucky-doors'), [row(ids[0], 1)], null, ids[0]).awards).toEqual([]);
  });

  it('ranks teams fairly whatever their size (1 against 3) and routes the points by the round rule', () => {
    const solo = 'a0000000-0000-4000-8000-000000000001'; const crowd = 'a0000000-0000-4000-8000-000000000002';
    const context: TeamContext = { lineupId: 'b0000000-0000-4000-8000-000000000001', answers: 'everyone', points: 'both',
      teamOf: new Map([[ids[0], solo], [ids[1], crowd], [ids[2], crowd], [ids[3], crowd]]), members: new Map([[solo, [ids[0]]], [crowd, [ids[1], ids[2], ids[3]]]]), captainOf: new Map() };
    const result = minigameOutcome(rules('tap-race'), [row(ids[0], 60), row(ids[1], 50), row(ids[2], 50), row(ids[3], 55)], context, ids[0]);
    // Average: 60 for the single player against 51.7 for the three.
    expect(result.entries.slice(0, 2)).toEqual([{ playerId: null, teamId: solo, value: 60, place: 1 }, { playerId: null, teamId: crowd, value: 52, place: 2 }]);
    expect(result.awards.filter(award => award.teamId).map(award => [award.teamId, award.amountMilli])).toEqual([[solo, 10000n], [crowd, 6000n]]);
    expect(result.awards.filter(award => award.playerId).length).toBe(4);
    expect(teamValue('tap-race', 'total', [-10, -20])).toBe(-30);
    expect(teamValue('reaction', 'total', [200, 300])).toBe(250); // a total of reaction times would punish bigger teams
  });

  it('lists a captain\u2019s answer once, as the team\u2019s row, with what the captain drew or aimed', () => {
    const context: TeamContext = { lineupId: 'lineup', answers: 'captain', points: 'team',
      teamOf: new Map([[ids[0], 'left'], [ids[1], 'left'], [ids[2], 'right'], [ids[3], 'right']]),
      members: new Map([['left', [ids[0], ids[1]]], ['right', [ids[2], ids[3]]]]), captainOf: new Map([['left', ids[0]], ['right', ids[2]]]) };
    const team = (teamId: string, value: number, angle: number) => ({ playerId: null, teamId, value: { kind: 'minigame', value, angle } });
    const result = minigameOutcome(rules('match-the-angle'), [team('left', 30, 480), team('right', 80, 530)], context, 'stage');
    expect(result.entries).toEqual([
      { playerId: null, teamId: 'left', value: 30, place: 1, angle: 480 },
      { playerId: null, teamId: 'right', value: 80, place: 2, angle: 530 },
    ]);
  });

  it('uses the first matching best guess or the last included average guess for team angle ties', () => {
    const left = 'left';
    const right = 'right';
    const context: TeamContext = { lineupId: 'lineup', answers: 'everyone', points: 'team',
      teamOf: new Map([[ids[0], left], [ids[1], left], [ids[2], right], [ids[3], right]]),
      members: new Map([[left, [ids[0], ids[1]]], [right, [ids[2], ids[3]]]]), captainOf: new Map() };
    const rows = ids.map((id, index) => ({ ...row(id, 2), receivedAt: at([3000, 6000, 4000, 5000][index]!) }));
    expect(minigameOutcome(rules('match-the-angle', { teamResult: 'best' }), rows, context, 'stage').entries[0]?.teamId).toBe(left);
    expect(minigameOutcome(rules('match-the-angle'), rows, context, 'stage').entries[0]?.teamId).toBe(right);
  });

  it('breaks equal cuts by who locked in first', () => {
    const rows = ids.map((id, index) => ({ ...row(id, [2, 2, 1, 2][index]!), receivedAt: at([6000, 4000, 9000, 4000][index]!) }));
    const places = new Map(minigameOutcome(rules('cut-the-line'), rows, null, 'stage').entries.map(entry => [entry.playerId, entry.place]));
    expect([ids[2], ids[1], ids[3], ids[0]].map(id => places.get(id))).toEqual([1, 2, 2, 4]); // closest first; equal distance and time share a place
  });

  it('lets equal cuts share the place when the scene says so, and never uses time for games without a speed tie-break', () => {
    const rows = ids.map((id, index) => ({ ...row(id, [2, 2, 1, 2][index]!), receivedAt: at([6000, 4000, 9000, 4000][index]!) }));
    const placesOf = (outcome: ReturnType<typeof minigameOutcome>) => [ids[2], ids[1], ids[3], ids[0]].map(id => outcome.entries.find(entry => entry.playerId === id)?.place);
    expect(placesOf(minigameOutcome(rules('cut-the-line', { tiebreak: 'shared' }), rows, null, 'stage'))).toEqual([1, 2, 2, 2]);
    expect(minigameTiebreak('cut-the-line', 'shared')).toBe('shared');
    expect(minigameTiebreak('stop-clock', 'faster')).toBe('shared'); // the stopped time is the result: speed does not settle it
    expect(minigameTiebreak('count-the-dots')).toBe('faster');
  });

  it('ranks every game the way the catalog says is better', () => {
    expect(rankValue('tap-race', MINIGAMES['tap-race'].defaults, { value: 40 })).toBe(-40); // higher is better
    expect(rankValue('reaction', MINIGAMES.reaction.defaults, { value: 240 })).toBe(240); // lower is better
    expect(rankValue('stop-clock', { targetMs: 10_000, visibleMs: 3000 }, { value: 9_700 })).toBe(300); // distance from the target
    expect(rankValue('lucky-doors', MINIGAMES['lucky-doors'].defaults, { value: 1 })).toBeNull();
    expect(rankValue('relay-drawing', MINIGAMES['relay-drawing'].defaults, { value: 3 })).toBeNull(); // ranked by votes instead
  });
});

describe('authored precision targets', () => {
  it('uses exact cuts including the endpoints and draws from an inclusive range', () => {
    expect(startMinigame('cut-the-line', { target: { mode: 'exact', value: 0 } }, now).cutTarget).toBe(0);
    expect(startMinigame('cut-the-line', { target: { mode: 'exact', value: 100 } }, now).cutTarget).toBe(100);
    expect(startMinigame('cut-the-line', { target: { mode: 'range', min: 27, max: 32 } }, now, () => 0).cutTarget).toBe(27);
    expect(startMinigame('cut-the-line', { target: { mode: 'range', min: 27, max: 32 } }, now, max => max - 1).cutTarget).toBe(32);
  });

  it('uses the authored dot range and limits overlap to two units', () => {
    const first = startMinigame('count-the-dots', { viewSeconds: 5, count: { mode: 'range', min: 14, max: 18 }, allowOverlap: true }, now, () => 0);
    const pattern = first.dots!.pattern;
    expect(pattern).toHaveLength(14);
    const distances = pattern.flatMap(([x, y], index) => pattern.slice(index + 1).map(([otherX, otherY]) => Math.hypot(x - otherX, y - otherY)));
    expect(Math.min(...distances)).toBe(20);
    const last = startMinigame('count-the-dots', { viewSeconds: 5, count: { mode: 'range', min: 14, max: 18 } }, now, max => max - 1);
    expect(last.dots!.pattern).toHaveLength(18);
  });

  it('packs the maximum authored range with at most slight overlap and keeps the default range', () => {
    for (const allowOverlap of [false, true]) {
      const settings = DotSettingsSchema.parse({ viewSeconds: 5, count: { mode: 'range', min: 1, max: 500 }, allowOverlap });
      for (const [random, count] of [[(max: number) => Math.min(99, max - 1), 100], [(max: number) => max - 1, 500]] as const) {
        const { pattern } = startMinigame('count-the-dots', settings, now, random).dots!;
        expect(DotPatternSchema.parse(pattern)).toHaveLength(count);
        let closest = Infinity;
        for (const [index, [x, y]] of pattern.entries()) {
          for (const [otherX, otherY] of pattern.slice(index + 1)) closest = Math.min(closest, Math.hypot(x - otherX, y - otherY));
        }
        if (allowOverlap) expect(closest).toBe(2 * DOT_RADIUS - 2);
        else expect(closest).toBeGreaterThanOrEqual(2 * DOT_RADIUS);
      }
    }
    const customRange = DotSettingsSchema.parse({ viewSeconds: 5, count: { mode: 'range', min: 1, max: 500 } });
    expect(startMinigame('count-the-dots', customRange, now, () => 0).dots!.pattern).toHaveLength(1);
    expect(DotSettingsSchema.safeParse({ viewSeconds: 5, count: { mode: 'exact', value: 0 } }).success).toBe(false);
    expect(DotSettingsSchema.safeParse({ viewSeconds: 5, count: { mode: 'exact', value: 501 } }).success).toBe(false);
    expect(startMinigame('count-the-dots', { viewSeconds: 5 }, now, () => 0).dots!.pattern).toHaveLength(50);
    expect(startMinigame('count-the-dots', { viewSeconds: 5 }, now, max => max - 1).dots!.pattern).toHaveLength(500);
  });
});

describe('points by closeness', () => {
  const within = { kind: 'within' as const, distance: 5, pointsMilli: '10000' };
  const scale = { kind: 'scale' as const, distance: 20, pointsMilli: '10000' };

  it('pays everyone close enough the same, and a sliding scale less the further off, in whole points', () => {
    // Cut the Line measures in tenths of a percent; the author's distance is in percent.
    expect([0, 50, 51].map(off => closenessPoints('cut-the-line', within, off))).toEqual([10_000n, 10_000n, 0n]);
    expect([0, 30, 100, 190, 200, 600].map(off => closenessPoints('cut-the-line', scale, off))).toEqual([10_000n, 9000n, 5000n, 1000n, 0n, 0n]);
    expect(closenessPoints('cut-the-line', scale, null)).toBe(0n); // no result, no points
    // Draw the Graph measures in hundredths of a percent; the author's distance is in percent.
    expect(closenessPoints('draw-the-graph', { ...within, distance: 5 }, 500)).toBe(10_000n);
    expect(closenessPoints('draw-the-graph', { ...within, distance: 5 }, 501)).toBe(0n);
    // Fractional points are never rounded up past the most a result can earn.
    expect(closenessPoints('cut-the-line', { ...scale, pointsMilli: '2500' }, 0)).toBe(2500n);
  });

  it('only fits target minigames and distances they can measure', () => {
    expect(minigameScoring('match-the-angle', { kind: 'within', distance: 180, pointsMilli: '5000' })).not.toBeNull();
    expect(minigameScoring('match-the-angle', { kind: 'within', distance: 181, pointsMilli: '5000' })).toBeNull();
    expect(minigameScoring('cut-the-line', { kind: 'scale', distance: 0, pointsMilli: '5000' })).toBeNull(); // a scale needs room to shrink
    expect(minigameScoring('tap-race', within)).toBeNull();
    expect(minigameScoring('stop-clock', { kind: 'within', distance: 250, pointsMilli: '5000' })).not.toBeNull();
  });

  it('pays every player by their own distance, ignoring places and the tie rule', () => {
    const rows = ids.map((id, index) => ({ ...row(id, [0, 30, 30, 300][index]!), receivedAt: at([4000, 5000, 3000, 2000][index]!) }));
    const paid = (scoring: typeof within | typeof scale) => ids.map(id => minigameOutcome(rules('cut-the-line', { scoring, tiebreak: 'shared' }), rows, null, 'stage').awards.find(award => award.playerId === id)?.amountMilli ?? 0n); // no award row for 0
    expect(paid(within)).toEqual([10_000n, 10_000n, 10_000n, 0n]);
    expect(paid(scale)).toEqual([10_000n, 9000n, 9000n, 0n]);
  });

  it('pays a team by its combined result, like its place', () => {
    const context: TeamContext = { lineupId: 'lineup', answers: 'everyone', points: 'team',
      teamOf: new Map([[ids[0], 'a'], [ids[1], 'a'], [ids[2], 'b'], [ids[3], 'b']]), members: new Map([['a', [ids[0], ids[1]]], ['b', [ids[2], ids[3]]]]), captainOf: new Map() };
    const rows = ids.map((id, index) => ({ ...row(id, [20, 120, 40, 40][index]!), receivedAt: at(3000) }));
    const teamPoints = (teamResult: 'average' | 'best') => Object.fromEntries(minigameOutcome(rules('cut-the-line', { scoring: within, tiebreak: 'shared', teamResult }), rows, context, 'stage').awards
      .filter(award => award.teamId && !award.playerId).map(award => [award.teamId, award.amountMilli]));
    expect(teamPoints('average')).toEqual({ b: 10_000n }); // a: 7% off on average, so nothing
    expect(teamPoints('best')).toEqual({ a: 10_000n, b: 10_000n });
  });
});

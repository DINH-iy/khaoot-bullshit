import { describe, expect, it } from 'vitest';
import { ANGLE_TARGETS, MINIGAMES, ROULETTE_POCKETS, ROULETTE_ORDER, rouletteColor, rouletteReturn } from '@party/contracts';
import { judgeResult, places, startMinigame, teamValue } from '../../src/minigames/shared/rules.js';
import { FASTEST_REACTION_MS } from '../../src/minigames/reaction/judge.js';
import { TAP_TAIL } from '../../src/minigames/tap-race/judge.js';
import { networkAllowance } from '../../src/minigames/shared/fairness.js';
import { createLiveSignals } from '../../src/minigames/tap-race/live.js';
import { minigameOutcome, type MinigameRules } from '../../src/minigames/shared/outcome.js';
import { GameError } from '../../src/game/errors.js';
import type { TeamContext } from '../../src/game/teams/teams.js';

const now = new Date('2026-11-13T10:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);
const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004'] as const;
const row = (playerId: string, value: number, early?: true) => ({ playerId, teamId: null, value: { kind: 'minigame', value, ...(early ? { early } : {}) } });
const rules = (game: MinigameRules['game'], extra: Partial<MinigameRules> = {}): MinigameRules => ({ game, settings: MINIGAMES[game].defaults, placementMilli: ['10000', '6000', '3000'], teamResult: 'average', ...extra });
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

  it('awards every correct roulette pick and pays neither color on green zero', () => {
    const game = 'red-or-black-roulette';
    const rule = rules(game, { placementMilli: ['4000'] });
    const guesses = [row(ids[0], 0), row(ids[1], 0), row(ids[2], 1)];
    const counts = Array.from({ length: ROULETTE_POCKETS }, (_, pocket) => rouletteColor(pocket));
    expect(counts.filter(color => color === 'red')).toHaveLength(18);
    expect(counts.filter(color => color === 'black')).toHaveLength(18);
    expect(counts.filter(color => color === 'green')).toHaveLength(1);
    for (const [pocket, winners] of [[0, []], [1, [ids[0], ids[1]]], [2, [ids[2]]]] as const) {
      const run = startMinigame(game, {}, now, () => pocket);
      const result = minigameOutcome(rule, guesses, null, 'stage', run);
      expect(result.awards.map(award => [award.playerId, award.amountMilli])).toEqual(winners.map(id => [id, 4000n]));
    }
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
    expect(judgeResult('match-the-angle', {}, run, { value: 360 }, at(3000))).toEqual({ angle: 0, value: 6 });
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
    expect(rejected(() => judgeResult('tap-race', { seconds: 10 }, race, { value: 161 }, at(13000)))).toBe(true); // over 16 taps a second
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
    expect(report(ids[0], 500, 5000)).toBe(29); // 1 s later: at most 16 more (+3)
    expect(report(ids[0], 20, 6000)).toBe(29); // never goes down
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
});

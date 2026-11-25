import { describe, expect, it } from 'vitest';
import { dueVotes, voteWinner } from '../../src/minigames/shared/steps/engine.js';
import { STEP_GAMES } from '../../src/minigames/shared/steps/games.js';

describe('a team vote', () => {
  const options = ['red', 'black'];
  it('goes to the option with the most votes cast', () => {
    expect(voteWinner(options, [{ playerId: 'a', option: 'black' }, { playerId: 'b', option: 'black' }, { playerId: 'c', option: 'red' }], null, () => 0)).toBe('black');
  });
  it('on a tie, goes to the captain’s vote, else a random tied option', () => {
    const tie = [{ playerId: 'a', option: 'red' }, { playerId: 'b', option: 'black' }];
    expect(voteWinner(options, tie, 'b', () => 0)).toBe('black');
    expect(voteWinner(options, tie, null, () => 1)).toBe('red');
    expect(voteWinner(options, tie, null, () => 0)).toBe('black');
  });
  it('without any vote, picks a random option', () => {
    expect(voteWinner(options, [], null, () => 1)).toBe('black');
  });
  it('is found once its time has run out', () => {
    const stage = { presentation: { minigame: { startsAt: new Date(0).toISOString(), goAt: null, doorsMilli: null, steps: {
      'team:a': { state: {}, step: 2, stepAt: new Date(0).toISOString(), captainId: null, voteEndsAt: new Date(10_000).toISOString() },
      'team:b': { state: {}, step: 0, stepAt: new Date(0).toISOString(), captainId: null, voteEndsAt: null } } } } };
    expect(dueVotes(stage, new Date(9_000))).toEqual([]);
    expect(dueVotes(stage, new Date(10_000))).toEqual([{ side: 'team:a', step: 2 }]);
  });
});

describe('the step games’ rules', () => {
  const run = { startsAt: new Date(0).toISOString(), goAt: null, doorsMilli: ['0', '5000'] };
  it('Drive the bus: four guesses, then done; screens see only the cards guessed', () => {
    const bus = STEP_GAMES['bus']!; const settings = { sips: [1, 2, 3, 4] };
    let state = bus.start(settings, run, () => 0);
    expect((bus.view(state, settings, run, 0) as { cards: unknown[] }).cards).toEqual([]);
    for (const guess of ['red', 'higher', 'inside', 'hearts']) { expect(bus.options(state, settings, run)).toContain(guess); state = bus.apply(state, guess, settings, run); }
    expect(bus.options(state, settings, run)).toBeNull();
    expect((bus.view(state, settings, run, 0) as { cards: unknown[] }).cards).toHaveLength(4);
    expect(bus.result(state, settings, run, new Date(0))).toBeGreaterThanOrEqual(0); expect(bus.result(state, settings, run, new Date(0))).toBeLessThanOrEqual(10);
  });
  it('Lucky doors pays what is behind the door picked; Left or right keeps the choice secret', () => {
    const doors = STEP_GAMES['lucky-doors']!; const settings = { doorsMilli: ['0', '5000'] };
    expect(doors.payoutMilli!(doors.apply(doors.start(settings, run, () => 0), '1', settings, run), settings, run)).toBe(5000n);
    const majority = STEP_GAMES['majority']!;
    expect(majority.secret).toBe(true);
    expect(majority.view(majority.apply(majority.start({}, run, () => 0), 'left', {}, run), {}, run, 0)).toEqual({ chosen: true });
  });
});

describe('Lucky doors: which door hides what', () => {
  it('is shuffled every game, unless the host fixed it as listed', async () => {
    const { startMinigame } = await import('../../src/minigames/shared/rules.js');
    const doorsMilli = ['0', '1000', '2000', '3000'];
    expect(startMinigame('lucky-doors', { doorsMilli, order: 'fixed' }, new Date(0), () => 0).doorsMilli).toEqual(doorsMilli);
    expect(startMinigame('lucky-doors', { doorsMilli }, new Date(0), () => 0).doorsMilli).not.toEqual(doorsMilli);
  });
});

describe('Drive the bus: a rainbow is called, not found', () => {
  const bus = STEP_GAMES['bus']!;
  const run = { startsAt: '', goAt: null, doorsMilli: null };
  const settings = { sips: [1, 2, 3, 4], rainbow: true };
  const cards = (suits: string[]) => suits.map((suit, index) => ({ rank: index + 2, suit }));
  // Rounds 1–3 guessed right for these cards (2, 3, 4, 5: red/black by suit, higher, outside), then `last`.
  const played = (suits: string[], last: string) => ({ cards: cards(suits), guesses: [suits[0] === 'hearts' || suits[0] === 'diamonds' ? 'red' : 'black', 'higher', 'outside', last] });
  const done = (suits: string[], last: string) => ({ state: played(suits, last), done: true });
  const rainbow = ['hearts', 'clubs', 'diamonds', 'spades'];

  it('offers Rainbow in round 4 only while three different suits are showing and the rule is on', () => {
    const before = (suits: string[]) => ({ ...played(suits, 'hearts'), guesses: played(suits, 'hearts').guesses.slice(0, 3) });
    expect(bus.options(before(rainbow), settings, run)).toEqual(['hearts', 'diamonds', 'clubs', 'spades', 'rainbow']);
    expect(bus.options(before(['hearts', 'hearts', 'clubs', 'spades']), settings, run)).toEqual(['hearts', 'diamonds', 'clubs', 'spades']);
    expect(bus.options(before(rainbow), { ...settings, rainbow: false }, run)).toEqual(['hearts', 'diamonds', 'clubs', 'spades']);
    expect(bus.options({ ...before(rainbow), guesses: ['red', 'higher'] }, settings, run)).toEqual(['inside', 'outside']);
  });

  it('a right call makes every other team drink the last round’s sips; the caller drinks nothing', () => {
    const called = done(rainbow, 'rainbow'); const plain = done(['hearts', 'hearts', 'clubs', 'spades'], 'spades');
    expect(bus.result(called.state, settings, run, new Date())).toBe(0);
    expect(bus.extras!([called, plain], settings)).toEqual([0, 4]);
    expect(bus.extras!([called, called], settings)).toEqual([4, 4]);
    expect(bus.resultFlags!(called.state, settings, run)).toEqual({ rainbow: true });
  });

  it('a wrong call costs the caller the last round’s sips, and nobody else', () => {
    const missed = done(['hearts', 'clubs', 'diamonds', 'hearts'], 'rainbow');
    expect(bus.result(missed.state, settings, run, new Date())).toBe(4);
    expect(bus.resultFlags!(missed.state, settings, run)).toEqual({});
    expect(bus.extras!([missed, done(rainbow, 'spades')], settings)).toEqual([0, 0]);
  });

  it('four suits without calling it are an ordinary suit guess: no rainbow', () => {
    const guessed = done(rainbow, 'spades'); const wrong = done(rainbow, 'hearts');
    expect(bus.result(guessed.state, settings, run, new Date())).toBe(0);
    expect(bus.result(wrong.state, settings, run, new Date())).toBe(4);
    expect(bus.resultFlags!(guessed.state, settings, run)).toEqual({});
    expect(bus.extras!([guessed, wrong], settings)).toEqual([0, 0]);
  });

  it('can be switched off, and does not count before the fourth card', () => {
    expect(bus.extras!([done(rainbow, 'rainbow'), done(['hearts', 'hearts', 'clubs', 'spades'], 'spades')], { ...settings, rainbow: false })).toEqual([0, 0]);
    expect(bus.extras!([{ ...done(rainbow, 'rainbow'), done: false }, done(['hearts', 'hearts', 'hearts', 'hearts'], 'hearts')], settings)).toEqual([0, 0]);
  });
});

describe('Speed run', () => {
  it('only offers adjacent open cells, times the finish on the server, and keeps elapsed play through a restart', () => {
    const race = STEP_GAMES['speed-run']!;
    const clock = { startsAt: new Date(5000).toISOString(), goAt: null, doorsMilli: null, raceElapsedMs: 2400 };
    let state = race.start({}, clock, () => 0);
    expect(race.options(state, {}, clock)).toEqual(['down', 'right']);
    const route = ['down', 'down', 'right', 'right', 'down', 'down', 'right', 'right', 'right', 'right'];
    for (const move of route) {
      expect(race.options(state, {}, clock)).toContain(move);
      state = race.apply(state, move, {}, clock);
    }
    expect(race.options(state, {}, clock)).toBeNull();
    expect(race.result(state, {}, clock, new Date(8100))).toBe(5500);
  });

  it('does not award a finish for using up all 64 moves', () => {
    const run = { startsAt: new Date(0).toISOString(), goAt: null, doorsMilli: null };
    const race = STEP_GAMES['speed-run']!;
    let state = race.start({}, run, () => 0);
    for (let step = 0; step < 64; step++) state = race.apply(state, step % 2 ? 'left' : 'right', {}, run);
    expect(race.options(state, {}, run)).toBeNull();
    expect(race.result(state, {}, run, new Date(20_000))).toBeNull();
  });
});

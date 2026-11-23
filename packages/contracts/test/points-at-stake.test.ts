import { describe, expect, it } from 'vitest';
import { pointsAtStake } from '../src/index.js';

const quiz = (scoring: Record<string, unknown>) => ({ kind: 'collect', scoring });

describe('the points a round puts at stake', () => {
  it('a quiz question: exactly its points, or up to its points plus the extra for the fastest', () => {
    expect(pointsAtStake(quiz({ kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '10000' }))).toEqual({ kind: 'round', milli: '10000', upTo: false });
    expect(pointsAtStake(quiz({ kind: 'correct-order', correctOrder: ['a', 'b'], awardMilli: '10000', places: { kind: 'list', pointsMilli: ['5000', '2000'] } })))
      .toEqual({ kind: 'round', milli: '15000', upTo: true });
    // A split total: 1st place gets its share (3 of 6 parts of 6 points).
    expect(pointsAtStake(quiz({ kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '0', places: { kind: 'split', totalMilli: '6000', places: 3, curve: 'even' } })))
      .toEqual({ kind: 'round', milli: '3000', upTo: true });
  });

  it('a minigame: its 1st place, the standard 10 points when it sets none', () => {
    expect(pointsAtStake({ kind: 'minigame', game: 'lucky-doors' })).toEqual({ kind: 'round', milli: '10000', upTo: true });
    expect(pointsAtStake({ kind: 'minigame', placementMilli: ['25000', '1000'] })).toEqual({ kind: 'round', milli: '25000', upTo: true });
    expect(pointsAtStake({ kind: 'minigame', placementMilli: ['25000'], places: { kind: 'list', pointsMilli: ['7000'] } })).toEqual({ kind: 'round', milli: '7000', upTo: true });
  });

  it('a challenge: up to the most the host can give, or the 1st place', () => {
    expect(pointsAtStake({ kind: 'challenge', maxAwardMilli: '20000' })).toEqual({ kind: 'round', milli: '20000', upTo: true });
    expect(pointsAtStake({ kind: 'challenge', maxAwardMilli: '20000', places: { kind: 'list', pointsMilli: ['8000', '4000'] } })).toEqual({ kind: 'round', milli: '8000', upTo: true });
  });

  it('a vote: points per vote and the extra for the most votes', () => {
    expect(pointsAtStake({ kind: 'vote', awardPerVoteMilli: '2000' })).toEqual({ kind: 'vote', perVoteMilli: '2000', bonusMilli: null });
    expect(pointsAtStake({ kind: 'vote', awardPerVoteMilli: '0', places: { kind: 'list', pointsMilli: ['5000'] } })).toEqual({ kind: 'vote', perVoteMilli: '0', bonusMilli: '5000' });
  });

  it('nothing for rounds without points, or a broken scene being edited', () => {
    expect(pointsAtStake(quiz({ kind: 'none' }))).toBeNull();
    expect(pointsAtStake(quiz({ kind: 'correct-choice', correctChoiceKey: 'a', awardMilli: '0' }))).toBeNull();
    expect(pointsAtStake({ kind: 'vote', awardPerVoteMilli: '0' })).toBeNull();
    expect(pointsAtStake({ kind: 'challenge', maxAwardMilli: 'lots' })).toBeNull();
    for (const kind of ['info', 'scoreboard', 'route', 'teams', 'duel']) expect(pointsAtStake({ kind })).toBeNull();
  });
});

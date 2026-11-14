import { describe, expect, it } from 'vitest';
import { importDefinition } from '../../src/authoring/import.js';
import { inspectDefinition } from '../../src/authoring/drafts.js';

// Points by place and duels, in the simple text format (as an AI assistant writes it).
const imported = (scenes: object[]) => {
  const definition = importDefinition(JSON.stringify({ title: 'Imported', scenes })) as { nodes: { key: string; stages: Record<string, unknown>[] }[] };
  return { definition, issues: inspectDefinition(definition).issues, stage: (key: string) => definition.nodes.find(node => node.key === key)!.stages[0]! };
};

describe('importing points by place and duels', () => {
  it('reads places as a list or a split total on every kind of scene that gives points', () => {
    const { issues, stage } = imported([
      { id: 'q', type: 'quiz', question: 'Fast?', answers: ['Yes', 'No'], correct: 'Yes', places: [10, 5] },
      { id: 'w', type: 'writing', question: 'Joke' },
      { id: 'v', type: 'vote', question: 'Best?', votesOn: 'w', pointsPerVote: 0, places: { total: 30, places: 3, curve: 'steep' } },
      { id: 'c', type: 'challenge', question: 'Sing', maxPoints: 0, places: [3, 2, 1] },
      { id: 'm', type: 'minigame', question: 'Tap', game: 'tap-race', places: { total: 12, places: 2 } },
    ]);
    expect(issues).toEqual([]);
    expect(stage('q')['scoring']).toMatchObject({ kind: 'correct-choice', places: { kind: 'list', pointsMilli: ['10000', '5000'] } });
    expect(stage('v')['places']).toEqual({ kind: 'split', totalMilli: '30000', places: 3, curve: 'steep' });
    expect(stage('c')['places']).toEqual({ kind: 'list', pointsMilli: ['3000', '2000', '1000'] });
    expect(stage('m')).toMatchObject({ places: { kind: 'split', totalMilli: '12000', places: 2, curve: 'even' } });
    expect(stage('m')['placementMilli']).toBeUndefined();
  });
  it('reads a duel decided by the host, and one played as a game by name', () => {
    const { issues, stage } = imported([
      { id: 'pool', type: 'duel', question: 'A game of pool!', pick: 'host', points: 20, betPoints: 2 },
      { id: 'chess', type: 'duel', question: 'Quick chess', game: 'Chess', seconds: 45 },
      { id: 'rps', type: 'versus', question: 'RPS', game: 'rps', settings: { firstTo: 3 }, places: [10, 4] },
    ]);
    expect(issues).toEqual([]);
    expect(stage('pool')).toMatchObject({ kind: 'duel', pick: 'host', betMilli: '2000', places: { kind: 'list', pointsMilli: ['20000'] }, durationMs: 30000 });
    expect(stage('pool')['contest']).toBeUndefined();
    expect(stage('chess')).toMatchObject({ pick: 'random', durationMs: 45000, contest: { kind: 'game', game: 'chess' } });
    expect(stage('rps')).toMatchObject({ contest: { kind: 'game', game: 'rps', settings: { firstTo: 3 } }, places: { kind: 'list', pointsMilli: ['10000', '4000'] } });
  });
});

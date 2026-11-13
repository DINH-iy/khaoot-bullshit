import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importDefinition } from '../../src/authoring/import.js';
import { inspectDefinition } from '../../src/authoring/drafts.js';
import { maxPathStages } from '../../src/game/graph.js';
import { builtInGames } from '../../src/game/templates.js';

const guide = readFileSync(new URL('../../../../docs/guides/importing-games.md', import.meta.url), 'utf8');
const instructions = guide.slice(guide.indexOf('<!-- ai-instructions:start -->'), guide.indexOf('<!-- ai-instructions:end -->'));
const example = /```json\s*([\s\S]*?)```/.exec(instructions)![1]!;
const check = (text: string) => { const definition = importDefinition(text); expect(definition).not.toBeNull(); return { issues: inspectDefinition(definition).issues, definition: definition! }; };

describe('importing a game from text', () => {
  it('imports the example from the AI instructions with every setting right and no problems', () => {
    const { issues, definition } = check(example);
    expect(issues).toEqual([]);
    const game = definition as { formatVersion: number; nodes: { key: string; stages: Record<string, unknown>[] }[]; edges: { from: string; to: string; option?: string }[] };
    expect(game.formatVersion).toBe(2);
    const stage = (key: string) => game.nodes.find(node => node.key === key)!.stages[0]!;
    expect(stage('warmup')).toMatchObject({ kind: 'collect', durationMs: 15000, input: { kind: 'choice', options: [{ key: 'friday', label: 'Friday' }, { key: 'monday' }, { key: 'sunday' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'friday', awardMilli: '5000' } });
    expect(stage('excuse-vote')).toMatchObject({ kind: 'vote', source: { nodeKey: 'excuse', stageKey: 'main' }, awardPerVoteMilli: '5000', durationMs: 40000 });
    expect(stage('finale')).toMatchObject({ input: { kind: 'order', items: [{ label: 'Walkman' }, { label: 'Discman' }, { label: 'iPod' }, { label: 'Smartphone' }] }, scoring: { kind: 'correct-order', correctOrder: ['walkman', 'discman', 'ipod', 'smartphone'], awardMilli: '15000' } });
    expect(game.edges.filter(edge => edge.from === 'choose')).toEqual([expect.objectContaining({ to: 'music', option: 'music' }), expect.objectContaining({ to: 'sculpture', option: 'physical' })]);
    expect(game.edges.filter(edge => edge.to === 'finale').map(edge => edge.from).sort()).toEqual(['music', 'sculpture']);
    expect(maxPathStages(inspectDefinition(definition).definition!)).toBe(8);
  });

  it('accepts the answer wrapped in code fences with chatter around it', () => {
    expect(check(`Sure! Here is your game:\n\n\`\`\`json\n${example}\n\`\`\`\nHave fun!`).issues).toEqual([]);
  });

  it('fills in names, the start, the order and defaults for a bare minimum game', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Mini', scenes: [
      { type: 'cutscene', title: 'Hi', text: 'Welcome' },
      { type: 'quiz', question: 'Two plus two?', answers: ['3', '4'], correct: '4' },
      { type: 'poll', question: 'Pizza or pasta?', answers: ['Pizza', 'Pasta'] },
      { type: 'writing', question: 'Caption this' },
      { type: 'upload', question: 'Your pet', accept: ['Pictures', 'videos'] },
      { type: 'scoreboard', title: 'Scores' },
    ] }));
    expect(issues).toEqual([]);
    const game = definition as { startNodeKey: string; nodes: { key: string; stages: Record<string, unknown>[] }[]; edges: unknown[] };
    expect(game.startNodeKey).toBe(game.nodes[0]!.key);
    expect(game.edges).toHaveLength(5);
    expect(game.nodes[1]!.stages[0]).toMatchObject({ durationMs: 20000, input: { options: [{ key: 'answer1-3', label: '3' }, { key: 'answer2-4', label: '4' }] }, scoring: { correctChoiceKey: 'answer2-4', awardMilli: '10000' } });
    expect(game.nodes[2]!.stages[0]).toMatchObject({ scoring: { kind: 'none' } });
    expect(game.nodes[3]!.stages[0]).toMatchObject({ durationMs: 60000, input: { kind: 'text', maxLength: 240 } });
    expect(game.nodes[4]!.stages[0]).toMatchObject({ input: { kind: 'media', accept: ['image', 'video'] } });
  });

  it('turns mistakes into listed problems instead of refusing the game', () => {
    const { issues } = check(JSON.stringify({ title: 'Broken', scenes: [
      { id: 'q', type: 'quiz', question: 'One answer only', answers: ['Only'], correct: 'Only' },
      { id: 'v', type: 'vote', question: 'Vote', votesOn: 'nowhere' },
      { id: 'loop', type: 'cutscene', title: 'Again', text: 'Back to the start', next: 'q' },
    ] }));
    expect(issues.map(issue => issue.message)).toEqual(expect.arrayContaining(['This needs a different number of options.', 'The connections go round in a circle. A game must always move forward.']));
    expect(importDefinition('not json at all')).toBeNull();
    expect(importDefinition('[1, 2, 3]')).toBeNull();
  });

  it('respects "next": "end", parts, and per-scene team settings', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Parts', teams: { split: { kind: 'count', teams: 2 }, formation: 'random' },
      play: { kind: 'teams', lineup: { kind: 'game' }, answers: 'captain', points: 'both' },
      scenes: [
        { id: 'round', parts: [{ type: 'quiz', question: 'Q?', answers: ['A', 'B'], correct: 'A' }, { type: 'scoreboard', title: 'After round 1', show: 'both' }] },
        { id: 'solo', type: 'quiz', question: 'Solo?', answers: ['Yes', 'No'], correct: 'Yes', play: { kind: 'solo' }, next: 'end' },
        { id: 'unused', type: 'cutscene', title: 'Never', text: 'Not reached' },
      ] }));
    const game = definition as { nodes: { key: string; stages: { key: string }[] }[]; edges: { from: string; to: string }[] };
    expect(game.nodes[0]!.stages.map(stage => stage.key)).toEqual(['main', 'part-2']);
    expect(game.edges).toEqual([expect.objectContaining({ from: 'round', to: 'solo' })]);
    expect(issues).toEqual([expect.objectContaining({ nodeKey: 'unused', code: 'Unreachable node' })]);
  });

  it('imports the exact format unchanged, as written by Export as text', () => {
    for (const { definition } of builtInGames) {
      const imported = importDefinition(JSON.stringify(definition))!;
      expect(inspectDefinition(imported).issues).toEqual([]);
      expect(imported['nodes']).toEqual(definition.nodes);
    }
  });
  it('imports minigames by key or name, with settings, place points and team play', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Minis', scenes: [
      { id: 'race', type: 'minigame', question: 'Tap race!', game: 'Tap race', settings: { seconds: 5 }, points: [20, 10] },
      { id: 'duel', type: 'minigame', question: 'Duel', game: 'reaction', teamResult: 'best', play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'sizes', sizes: [1, 'rest'] }, formation: 'random' } }, answers: 'everyone', points: 'team' } },
      { id: 'later', type: 'minigame', question: 'Something else', game: 'hot potato' },
    ] }));
    const stages = (definition as { nodes: { stages: Record<string, unknown>[] }[] }).nodes.map(node => node.stages[0]!);
    expect(stages[0]).toMatchObject({ kind: 'minigame', game: 'tap-race', settings: { seconds: 5 }, placementMilli: ['20000', '10000'], durationMs: 20000 });
    expect(stages[1]).toMatchObject({ game: 'reaction', teamResult: 'best', play: { kind: 'teams' } });
    // An unknown minigame stays a scene to choose in the editor.
    expect(issues).toEqual([expect.objectContaining({ code: 'Choose a minigame', nodeKey: 'later' })]);
  });
});

import { HangmanWordSchema } from '@party/contracts';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importDefinition } from '../../src/authoring/import.js';
import { inspectDefinition } from '../../src/authoring/drafts.js';
import { resolveTheme, ThemeSchema } from '@party/contracts';
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
    expect(game).toMatchObject({ idleCloseMinutes: 30, autoRevealSeconds: 2, presentation: { theme: { preset: 'neptune', font: 'rounded', headingFont: 'condensed', sliderStyle: 'dial' }, translations: { nl: { 'answer.saved': 'Je antwoord is binnen!' } } } });
    const stage = (key: string) => game.nodes.find(node => node.key === key)!.stages[0]!;
    expect(stage('welcome')).toMatchObject({ youtube: { videoId: 'M7lc1UVf-VE', startSeconds: 5, endSeconds: 15 }, mediaLayout: { position: 'left', size: 'wide' } });
    expect(stage('warmup')).toMatchObject({ translations: { nl: { prompt: 'Welke dag is het?', labels: { friday: 'Vrijdag' } } } });
    expect(stage('warmup')).toMatchObject({ kind: 'collect', durationMs: 15000, input: { kind: 'choice', options: [{ key: 'friday', label: 'Friday' }, { key: 'monday' }, { key: 'sunday' }] }, scoring: { kind: 'correct-choice', correctChoiceKey: 'friday', awardMilli: '5000' } });
    expect(stage('excuse-vote')).toMatchObject({ kind: 'vote', source: { nodeKey: 'excuse', stageKey: 'main' }, awardPerVoteMilli: '5000', voteMode: 'ranked', voteLimit: 3, resultCards: 'manual', durationMs: 40000 });
    expect(stage('finale')).toMatchObject({ input: { kind: 'order', items: [{ label: 'Walkman' }, { label: 'Discman' }, { label: 'iPod' }, { label: 'Smartphone' }] }, scoring: { kind: 'correct-order', correctOrder: ['walkman', 'discman', 'ipod', 'smartphone'], awardMilli: '15000' } });
    expect(game.edges.filter(edge => edge.from === 'choose')).toEqual([expect.objectContaining({ to: 'music', option: 'music' }), expect.objectContaining({ to: 'sculpture', option: 'physical' })]);
    expect(game.edges.filter(edge => edge.to === 'finale').map(edge => edge.from).sort()).toEqual(['sculpture', 'sprint']);
    expect(stage('sprint')).toMatchObject({ kind: 'minigame', game: 'speed-run', durationMs: 45_000, settings: { course: ['S...#..', '.##...#', '....#..', '##.#...', '......F'] } });
    expect(stage('cut')).toMatchObject({ kind: 'minigame', game: 'cut-the-line', durationMs: 20_000, presentation: { theme: { font: 'serif' } }, settings: { target: { mode: 'exact', value: 37 } }, scoring: { kind: 'within', distance: 5, pointsMilli: '10000' } });
    expect(stage('angle')).toMatchObject({ kind: 'minigame', game: 'match-the-angle', durationMs: 20_000, tiebreak: 'shared', placementMilli: ['10000', '6000', '3000'] });
    expect(stage('dots')).toMatchObject({ kind: 'minigame', game: 'count-the-dots', durationMs: 15_000, countdownSeconds: 3, settings: { viewSeconds: 6, count: { mode: 'range', min: 1, max: 500 }, allowOverlap: true, revealEasing: 'ease-in' } });
    expect(stage('coin')).toMatchObject({ kind: 'minigame', game: 'heads-or-tails', durationMs: 15_000, placementMilli: ['10000'], settings: { flip: 'host' } });
    expect(stage('graph')).toMatchObject({ kind: 'minigame', game: 'draw-the-graph', durationMs: 30_000,
      settings: { revealEasing: 'ease-out', graph: { visible: [10, 20, 35, 50], hidden: [55, 65, 62, 80], yLabel: 'Visitors', scale: { min: 0, max: 1000 }, splitAt: 0.4, source: 'Example dataset', sourceUrl: 'https://example.org/museum-visits', sourceNote: 'Annual admissions.' } } });
    expect(stage('roulette')).toMatchObject({ kind: 'minigame', game: 'red-or-black-roulette', durationMs: 30_000, settings: { betFloor: 50 } });
    expect(game).toMatchObject({ presentation: { phoneMenuIcons: { scores: 'star', games: 'wheel', packs: 'sparkles', blackjack: 'cards' } } });
    expect(stage('pool')).toMatchObject({ kind: 'duel', pick: 'random', durationMs: 20_000, betMilli: '2000', matchSeconds: 120,
      contest: { kind: 'game', game: 'eight-ball', settings: { ballBehavior: { preset: 'arcade' }, start: { side: 'random', percent: 30 }, felt: 'blue' } }, places: { kind: 'list', pointsMilli: ['10000'] } });
    // The minigame draw: a party choice decided by a draw, one minigame scene per game; the team game gets teams for that round.
    expect(stage('draw')).toMatchObject({ kind: 'route', durationMs: null, decide: { method: 'draw' }, options: [{ label: 'Tap race' }, { label: 'Relay drawing' }] });
    expect(game.edges.filter(edge => edge.from === 'draw').map(edge => edge.to)).toEqual(['draw-tap', 'draw-relay']);
    expect(stage('draw-relay')).toMatchObject({ kind: 'minigame', game: 'relay-drawing', play: { kind: 'teams', lineup: { kind: 'round' } } });
    expect(stage('draw-tap')).not.toHaveProperty('play');
    expect(maxPathStages(inspectDefinition(definition).definition!)).toBe(18);
  });

  it('gives writing, upload and drawing rounds host points with maxPoints (and places); without them they stay votable', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Art night', scenes: [
      { id: 'art', type: 'drawing', question: 'Draw a cat', maxPoints: 10, places: [10, 5] },
      { id: 'joke', type: 'writing', question: 'Tell a joke' },
      { id: 'joke-vote', type: 'vote', question: 'Best joke?', votesOn: 'joke' },
      { id: 'pic', type: 'upload', question: 'Your pet', maxPoints: 5 },
    ] }));
    expect(issues).toEqual([]);
    const stage = (key: string) => (definition as { nodes: { key: string; stages: Record<string, unknown>[] }[] }).nodes.find(node => node.key === key)!.stages[0]!;
    expect(stage('art')['scoring']).toEqual({ kind: 'judged', maxAwardMilli: '10000', places: { kind: 'list', pointsMilli: ['10000', '5000'] } });
    expect(stage('joke')['scoring']).toEqual({ kind: 'none' });
    expect(stage('pic')['scoring']).toEqual({ kind: 'judged', maxAwardMilli: '5000' });
  });

  it('names the teams of a Pick teams scene, filling missing names with the standard ones', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Named', scenes: [{ id: 'pick', type: 'pick-teams', teams: 3, names: ['Sharks', 'Jets'], colors: 'teams' }] }));
    expect(issues).toEqual([]);
    expect((definition as { nodes: { stages: Record<string, unknown>[] }[] }).nodes[0]!.stages[0]!['form']).toMatchObject({ names: ['Sharks', 'Jets', 'Green'], colors: 'teams' });
  });

  it('imports a minigame draw with a timer, so it draws by itself', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Draw night', scenes: [
      { id: 'pick', type: 'random-minigame', question: 'Which one?', seconds: 10, games: [{ label: 'Reaction', to: 'a' }, { label: 'Stop the clock', to: 'b' }] },
      { id: 'a', type: 'minigame', game: 'reaction', next: 'scores' }, { id: 'b', type: 'minigame', game: 'stop-clock', next: 'scores' },
      { id: 'scores', type: 'scoreboard', title: 'Scores' },
    ] }));
    expect(issues).toEqual([]);
    expect((definition as { nodes: { key: string; stages: unknown[] }[] }).nodes.find(node => node.key === 'pick')!.stages[0]).toMatchObject({ kind: 'route', durationMs: 10_000, decide: { method: 'draw' } });
  });

  it('imports shared font references and keeps game fonts across scene presets unless explicitly overridden', () => {
    const font = { id: 'ab99c61c-dace-4222-91db-aef612125c5a', name: 'Shared Font' };
    const { issues, definition } = check(JSON.stringify({ title: 'Font night', look: { theme: { font, headingFont: font } },
      scenes: [{ id: 'hello', type: 'info', question: 'Hello', look: { theme: { preset: 'neon', headingFont: 'mono' } } }] }));
    expect(issues).toEqual([]);
    const game = definition as { presentation: { theme: unknown }; nodes: { stages: { presentation: { theme: unknown } }[] }[] };
    const base = ThemeSchema.parse(game.presentation.theme);
    const scene = ThemeSchema.parse(game.nodes[0]!.stages[0]!.presentation.theme);
    expect(resolveTheme(base, scene)).toMatchObject({ font, headingFont: 'mono' });
    expect(resolveTheme(base, { ...scene, headingFont: undefined })).toMatchObject({ font, headingFont: font });
  });

  it('makes teams in a Pick teams scene and plays the rounds after it in them; a game without one is solo', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Team night', scenes: [
      { id: 'teams', type: 'pick-teams', teams: 3, how: 'host', captains: true },
      { id: 'q1', type: 'quiz', question: 'Longest river?', answers: ['Nile', 'Amazon'], correct: 'Nile', inTeams: true, captain: true },
      { id: 'q2', type: 'quiz', question: 'Two plus two?', answers: ['4', '5'], correct: '4' },
    ] }));
    expect(issues).toEqual([]);
    const stages = (definition as { nodes: { stages: Record<string, unknown>[] }[] }).nodes.map(node => node.stages[0]!);
    expect(stages[0]).toMatchObject({ kind: 'teams', form: { split: { kind: 'count', teams: 3 }, formation: 'host' }, captains: true });
    expect(stages[1]).toMatchObject({ play: { kind: 'teams', lineup: { kind: 'game' }, answers: 'captain' } });
    expect(stages[2]!['play']).toBeUndefined();
    // A round in teams with no Pick teams scene before it is a problem to fix, not a silent team game.
    const solo = check(JSON.stringify({ title: 'Oops', scenes: [{ id: 'q', type: 'quiz', question: 'Q?', answers: ['A', 'B'], correct: 'A', inTeams: true }] }));
    expect(solo.issues.map(issue => issue.message).join(' ')).toContain('Pick teams');
    // Elected captains: the teams have captains, and each team votes for its own.
    const elected = check(JSON.stringify({ title: 'Vote night', scenes: [{ id: 'teams', type: 'pick-teams', captains: 'elected' }, { id: 'q', type: 'quiz', question: 'Q?', answers: ['A', 'B'], correct: 'A', inTeams: true, captain: true }] }));
    expect(elected.issues).toEqual([]);
    expect((elected.definition as { nodes: { stages: Record<string, unknown>[] }[] }).nodes[0]!.stages[0]).toMatchObject({ captains: true, form: { captainPick: 'elected' } });
  });

  it('imports Undercover with its own word pairs and counts, the rest from the standard settings', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Spies', scenes: [{ id: 'a', type: 'minigame', game: 'undercover', pairs: [['koffie', 'thee']], undercovers: 2, mrWhite: false, seconds: 900 }] }));
    expect(issues).toEqual([]);
    expect((definition as { nodes: { stages: Record<string, unknown>[] }[] }).nodes[0]!.stages[0]).toMatchObject({ game: 'undercover', durationMs: 900_000,
      settings: { undercovers: 2, mrWhite: false, turnSeconds: 30, voteSeconds: 45, pairs: [['koffie', 'thee']] } });
  });

  it('imports Galgje with its own words (kept as written; played without accents) and lives, or the built-in words of a language', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Words', scenes: [
      { id: 'a', type: 'minigame', game: 'hangman', words: ['Crème brûlée', 'fiets'], lives: 5 },
      { id: 'b', type: 'minigame', game: 'Hangman', wordLanguage: 'nl' },
    ] }));
    expect(issues).toEqual([]);
    const [a, b] = (definition as { nodes: { stages: Record<string, unknown>[] }[] }).nodes.map(node => node.stages[0]!);
    expect(a).toMatchObject({ game: 'hangman', settings: { lives: 5, words: ['Crème brûlée', 'fiets'] } });
    expect(HangmanWordSchema.parse('Crème brûlée')).toBe('creme brulee');
    expect(b).toMatchObject({ game: 'hangman', settings: { lives: 7, wordLanguage: 'nl' } });
  });

  it('accepts the answer wrapped in code fences with chatter around it', () => {
    expect(check(`Sure! Here is your game:\n\n\`\`\`json\n${example}\n\`\`\`\nHave fun!`).issues).toEqual([]);
  });

  it('reports an invalid clip or translation in the imported scene', () => {
    const { issues } = check(JSON.stringify({ title: 'Invalid scene', scenes: [
      { type: 'cutscene', title: 'Test', youtube: { videoId: 'M7lc1UVf-VE', startSeconds: 10, endSeconds: 5 }, translations: { fr: { title: 'Test' } } },
    ] }));
    expect(issues.map(issue => issue.message).join(' ')).toMatch(/endSeconds|end time/i);
    expect(issues.map(issue => issue.message).join(' ')).toMatch(/translations/i);
  });

  it('takes a scene’s explanation: its own text, or true for a minigame’s standard one', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Explained', scenes: [
      { type: 'quiz', question: 'Capital?', answers: ['Canberra', 'Sydney'], correct: 'Canberra', explain: 'One try each.' },
      { type: 'minigame', question: 'Doors', game: 'lucky-doors', explain: true }] }));
    expect(issues).toEqual([]);
    // Rounds that earn points show them in their intro.
    expect((definition.nodes as { stages: { explain?: unknown }[] }[]).map(node => node.stages[0]!.explain)).toEqual([{ text: 'One try each.', points: true }, { points: true }]);
  });

  it('takes an intro with only the points, without them, on the shared screen only, or leaves it out where there are no points', () => {
    const picture = { id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f', kind: 'image' };
    const { issues, definition } = check(JSON.stringify({ title: 'Intros', scenes: [
      { type: 'quiz', question: 'Big one', answers: ['A', 'B'], correct: 'A', points: 50, showPoints: true },
      { type: 'quiz', question: 'Quiet', answers: ['A', 'B'], correct: 'A', explain: 'Read carefully.', showPoints: false },
      { type: 'minigame', question: 'Doors', game: 'lucky-doors', explain: { screenOnly: true, picture, points: false } },
      { type: 'poll', question: 'Tea or coffee?', answers: ['Tea', 'Coffee'], showPoints: true }] }));
    expect(issues).toEqual([]);
    expect((definition.nodes as { stages: { explain?: unknown }[] }[]).map(node => node.stages[0]!.explain)).toEqual([
      { points: true }, { text: 'Read carefully.' }, { picture, screenOnly: true }, undefined]);
  });

  it('takes the open challenge invites per player from "openInvites", within 1 to 10', () => {
    const game = (openInvites: unknown) => check(JSON.stringify({ title: 'Invites', openInvites, scenes: [{ type: 'cutscene', title: 'Hi', text: 'Welcome' }] })).definition;
    expect(game(5).openInvites).toBe(5);
    expect(game(50).openInvites).toBe(10);
    expect(game(0).openInvites).toBe(1);
    expect(game(undefined).openInvites).toBeUndefined();
  });
  it('takes the host’s quick time button from "quickTime", within 5 to 600 seconds', () => {
    const game = (quickTime: unknown) => check(JSON.stringify({ title: 'Quick', quickTime, scenes: [{ type: 'cutscene', title: 'Hi', text: 'Welcome' }] })).definition;
    expect(game(60).quickTimeSeconds).toBe(60);
    expect(game(1).quickTimeSeconds).toBe(5);
    expect(game(undefined).quickTimeSeconds).toBeUndefined();
  });
  it('takes the room\'s starting settings from "room": switches as true/false, numbers into range, nothing else', () => {
    const game = (room: unknown) => check(JSON.stringify({ title: 'Room', room, scenes: [{ type: 'cutscene', title: 'Hi', text: 'Welcome' }] })).definition;
    expect(game({ showScores: false, reactions: true, reactionLimit: 99, breakVotes: false, breakPercent: 5, autoClose: true, autoCloseSeconds: 4.6 }).room)
      .toEqual({ showScores: false, reactions: true, reactionLimit: 30, breakVotes: false, breakPercent: 10, autoClose: true, autoCloseSeconds: 5 });
    expect(game({ showScores: 'no', chat: true, autoCloseSeconds: 'soon' }).room).toBeUndefined();
    expect(game(undefined).room).toBeUndefined();
    expect(check(example).definition.room).toEqual({ showScores: false, autoCloseSeconds: 5 });
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
  it('imports a minigame draw in one scene: games by key or name, each with its own time and settings', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Lucky', scenes: [
      { id: 'lucky', type: 'minigame', question: 'Which minigame will it be?', draw: ['Tap race', { game: 'cut-the-line', seconds: 25, settings: { target: { mode: 'exact', value: 37 } } }, 'not a game'] },
    ] }));
    expect(issues).toEqual([]);
    const stage = (definition as { nodes: { stages: Record<string, unknown>[] }[] }).nodes[0]!.stages[0]!;
    expect(stage).toMatchObject({ kind: 'minigame', game: 'tap-race', draw: [{ game: 'tap-race', durationMs: 20_000 },
      { game: 'cut-the-line', durationMs: 25_000, settings: { target: { mode: 'exact', value: 37 } } }] });
  });
});

describe('wheel colours', () => {
  const game = (colors: unknown) => importDefinition(JSON.stringify({ title: 'Wheel colours', wheels: [{ title: 'Forfeits', entries: ['Sing', 'Dance', 'Joke'], colors }],
    scenes: [{ id: 'spin', type: 'info', title: 'Spin', spin: 'Forfeits' }] })) as { wheels: { colors?: string[] }[] };
  it('keeps a wheel’s own colours (2 to 8 valid ones) and the game stays valid', () => {
    const definition = game(['#F39200', '#7ac6b6', 'not a colour']);
    expect(definition.wheels[0]!.colors).toEqual(['#f39200', '#7ac6b6']);
    expect(inspectDefinition(definition).issues).toEqual([]);
  });
  it('keeps see-through colours (#rrggbbaa)', () => {
    const definition = game(['#F3920080', '#7ac6b6']);
    expect(definition.wheels[0]!.colors).toEqual(['#f3920080', '#7ac6b6']);
    expect(inspectDefinition(definition).issues).toEqual([]);
  });
  it('without enough valid colours the wheel uses the game’s answer colours', () => {
    expect(game(['#f39200']).wheels[0]!.colors).toBeUndefined();
    expect(game(undefined).wheels[0]!.colors).toBeUndefined();
  });
  it('refuses a colour that is not #rrggbb or #rrggbbaa when saved from the editor', () => {
    const definition = game(['#f39200', '#7ac6b6']);
    definition.wheels[0]!.colors = ['#f39200', 'red'];
    expect(inspectDefinition(definition).issues.length).toBeGreaterThan(0);
  });
});

describe('pictures, videos and songs in imported scenes', () => {
  const media = { id: '0b5f3f6e-9d2a-4f3c-8a1e-2c4d6e8f0a1b', kind: 'image' };
  it('keeps a library file an exported game carries, and leaves out anything else', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Media', scenes: [
      { id: 'city', type: 'quiz', question: 'Which city is this?', answers: ['Paris', 'Rome'], correct: 'Paris', media },
      { id: 'song', type: 'quiz', question: 'Name this song', answers: ['A', 'B'], correct: 'A', media: 'a famous song' },
      { id: 'clip', type: 'cutscene', title: 'Watch', text: 'Watch this', media: { id: 'not-a-uuid', kind: 'video' } },
    ] }));
    expect(issues).toEqual([]);
    const stages = (definition as { nodes: { key: string; stages: Record<string, unknown>[] }[] }).nodes.map(node => node.stages[0]!);
    expect(stages[0]!['media']).toEqual(media);
    expect(stages[1]!['media']).toBeUndefined(); expect(stages[2]!['media']).toBeUndefined();
  });
});

describe('music in imported games', () => {
  const song = { id: '1c6f3f6e-9d2a-4f3c-8a1e-2c4d6e8f0a1b', kind: 'audio' };
  it('keeps a playlist and a scene song from an exported game, and "quiet" or "stop" written as text', () => {
    const { issues, definition } = check(JSON.stringify({ title: 'Music', music: { tracks: [song] }, scenes: [
      { id: 'one', type: 'quiz', question: 'Q1', answers: ['A', 'B'], correct: 'A', music: 'quiet' },
      { id: 'two', type: 'quiz', question: 'Q2', answers: ['A', 'B'], correct: 'A', music: { mode: 'play', track: song } },
      { id: 'three', type: 'cutscene', title: 'Hush', text: 'Silence', music: 'stop' },
      { id: 'four', type: 'cutscene', title: 'Bad', text: 'Not a song', music: { mode: 'play' } },
    ] }));
    expect(issues).toEqual([]);
    const game = definition as { music?: unknown; nodes: { stages: Record<string, unknown>[] }[] };
    expect(game.music).toEqual({ tracks: [song] });
    expect(game.nodes.map(node => node.stages[0]!['music'])).toEqual([{ mode: 'quiet' }, { mode: 'play', track: song }, { mode: 'stop' }, undefined]);
  });
});

it('reports a Speed run course with no path to the finish', () => {
  const { issues } = check(JSON.stringify({ title: 'Obstacle course', scenes: [{
    id: 'race', type: 'minigame', game: 'speed-run', question: 'Race!',
    settings: { course: ['S######', '#######', '#######', '#######', '######F'] },
  }] }));
  expect(issues.some(issue => issue.code === 'Minigame settings are not valid')).toBe(true);
});

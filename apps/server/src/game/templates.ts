import { parseDefinition, type GameDefinition } from './definition.js';
import { preparedGame } from './prepared-game.js';

const choice = (key: string, prompt: string, options: [string, string][], correct: string, durationMs: number, layout: 'list' | 'tiles') => ({
  key: 'answer', kind: 'collect' as const, prompt, durationMs,
  input: { kind: 'choice' as const, layout, options: options.map(([optionKey, label]) => ({ key: optionKey, label })) },
  scoring: { kind: 'correct-choice' as const, correctChoiceKey: correct, awardMilli: '10000' }, nodeKey: key,
});
const timedQuestions = [
  choice('planet', 'Which planet has the most known moons?', [['jupiter', 'Jupiter'], ['saturn', 'Saturn'], ['neptune', 'Neptune'], ['mars', 'Mars']], 'saturn', 20_000, 'tiles'),
  choice('ocean', 'Which ocean is the largest?', [['atlantic', 'Atlantic'], ['indian', 'Indian'], ['pacific', 'Pacific'], ['arctic', 'Arctic']], 'pacific', 20_000, 'list'),
  choice('bones', 'How many bones does an adult human have?', [['b186', '186'], ['b206', '206'], ['b226', '226'], ['b246', '246']], 'b206', 15_000, 'tiles'),
];
const timedQuiz = parseDefinition({
  formatVersion: 1, title: 'Timed quiz', startNodeKey: 'planet',
  nodes: [
    ...timedQuestions.map(({ nodeKey, ...stage }) => ({ key: nodeKey, stages: [stage] })),
    { key: 'sizes', stages: [{ key: 'arrange', kind: 'collect', prompt: 'Put these animals in order from lightest to heaviest.', durationMs: 30_000,
      input: { kind: 'order', items: [{ key: 'hippo', label: 'Hippopotamus' }, { key: 'mouse', label: 'Mouse' }, { key: 'wolf', label: 'Wolf' }, { key: 'horse', label: 'Horse' }] },
      scoring: { kind: 'correct-order', correctOrder: ['mouse', 'wolf', 'horse', 'hippo'], awardMilli: '20000' } }] },
    { key: 'excuse', stages: [{ key: 'write', kind: 'collect', prompt: 'Write the worst possible excuse for losing this quiz.', durationMs: 60_000, input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' } }] },
    { key: 'excuse-vote', stages: [{ key: 'vote', kind: 'vote', prompt: 'Vote for the best excuse. You cannot vote for your own.', durationMs: 45_000, source: { nodeKey: 'excuse', stageKey: 'write' }, awardPerVoteMilli: '5000' }] },
  ],
  edges: [{ key: 'excuse-to-vote', from: 'excuse', to: 'excuse-vote' }, { key: 'planet-to-ocean', from: 'planet', to: 'ocean' }, { key: 'ocean-to-bones', from: 'ocean', to: 'bones' }, { key: 'bones-to-sizes', from: 'bones', to: 'sizes' }, { key: 'sizes-to-excuse', from: 'sizes', to: 'excuse' }],
});

// Built-in games offered in the host menu until the editors exist. Server-only:
// the menu exposes titles and shape, never prompts or answer keys.
const pictureParty = parseDefinition({
  formatVersion: 1, title: 'Picture party', startNodeKey: 'pet',
  nodes: [
    { key: 'pet', stages: [{ key: 'upload', kind: 'collect', prompt: 'Upload the funniest picture or GIF on your phone.', durationMs: 90_000, input: { kind: 'media', accept: ['image', 'gif'] }, scoring: { kind: 'none' } }] },
    { key: 'pet-vote', stages: [{ key: 'vote', kind: 'vote', prompt: 'Vote for the funniest one. You cannot vote for your own.', durationMs: 60_000, source: { nodeKey: 'pet', stageKey: 'upload' }, awardPerVoteMilli: '5000' }] },
    { key: 'clip', stages: [{ key: 'upload', kind: 'collect', prompt: 'Upload a picture, GIF or short video that sums up your week.', durationMs: null, input: { kind: 'media', accept: ['image', 'gif', 'video'] }, scoring: { kind: 'none' } }] },
  ],
  edges: [{ key: 'pet-to-vote', from: 'pet', to: 'pet-vote' }, { key: 'vote-to-clip', from: 'pet-vote', to: 'clip' }],
});

// Game teams by default, with rounds that override it: solo, a one-off 1 vs the rest, and re-formed teams.
const captainTeams = { kind: 'teams', lineup: { kind: 'game' }, answers: 'captain', points: 'both' } as const;
const teamParty = parseDefinition({
  formatVersion: 1, title: 'Team party', startNodeKey: 'team-quiz',
  teams: { split: { kind: 'count', teams: 2 }, formation: 'random' }, play: captainTeams,
  nodes: [
    { key: 'team-quiz', stages: [choice('team-quiz', 'Team question: which is the longest river?', [['nile', 'Nile'], ['amazon', 'Amazon'], ['yangtze', 'Yangtze'], ['danube', 'Danube']], 'nile', 45_000, 'tiles')].map(({ nodeKey: _node, ...stage }) => stage) },
    { key: 'solo-quiz', stages: [{ ...choice('solo-quiz', 'Everyone for themselves: how many legs does a spider have?', [['six', '6'], ['eight', '8'], ['ten', '10']], 'eight', 20_000, 'tiles'), nodeKey: undefined, play: { kind: 'solo' } }].map(({ nodeKey: _node, ...stage }) => stage) },
    { key: 'one-vs-rest', stages: [{ key: 'perform', kind: 'challenge', prompt: 'One player against everyone else: the lone player hums a song, the others must guess it. The host judges each side.', durationMs: 60_000, maxAwardMilli: '30000',
      play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'sizes', sizes: [1, 'rest'] }, formation: 'random', names: ['Soloist', 'Everyone else'] } }, answers: 'everyone', points: 'members' } }] },
    { key: 'pick-teams', stages: [{ key: 'write', kind: 'collect', prompt: 'Pick your new team. Then: write your team\'s best excuse for losing.', durationMs: 90_000, input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' },
      play: { kind: 'teams', lineup: { kind: 'reform', form: { split: { kind: 'count', teams: 2 }, formation: 'players' }, carryover: 'members' }, answers: 'captain', points: 'team' } }] },
    { key: 'excuse-vote', stages: [{ key: 'vote', kind: 'vote', prompt: 'Vote for the best excuse. Not your own team\'s.', durationMs: 45_000, source: { nodeKey: 'pick-teams', stageKey: 'write' }, awardPerVoteMilli: '5000', play: { kind: 'solo' } }] },
  ],
  edges: [{ key: 'a', from: 'team-quiz', to: 'solo-quiz' }, { key: 'b', from: 'solo-quiz', to: 'one-vs-rest' }, { key: 'c', from: 'one-vs-rest', to: 'pick-teams' }, { key: 'd', from: 'pick-teams', to: 'excuse-vote' }],
});

// Format 2: the party votes on a route; both routes rejoin at the finale (the owner's flow-editor reference).
const fridayNightChaos = parseDefinition({
  formatVersion: 2, title: 'Friday Night Chaos', startNodeKey: 'opening',
  nodes: [
    { key: 'opening', stages: [{ key: 'cutscene', kind: 'info', title: 'FRIDAY NIGHT.', prompt: 'Welcome to Friday Night Chaos! Grab your phone: one warm-up question, then you choose tonight’s challenge.', durationMs: 30_000 }, { key: 'warmup', kind: 'collect', prompt: 'Warm-up: what day is it?', durationMs: 20_000,
      input: { kind: 'choice', layout: 'tiles', options: [{ key: 'friday', label: 'Friday' }, { key: 'monday', label: 'Monday' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'friday', awardMilli: '5000' } }] },
    { key: 'choose', stages: [{ key: 'route', kind: 'route', prompt: 'Choose your challenge!', durationMs: 20_000,
      options: [{ key: 'music', label: 'Music' }, { key: 'physical', label: 'Physical' }],
      decide: { method: 'players', tie: 'random', noVotes: 'default', counts: 'reveal' }, defaultOptionKey: 'music' }] },
    { key: 'music', stages: [{ key: 'tune', kind: 'collect', prompt: 'Music Mayhem: which instrument has 88 keys?', durationMs: 20_000,
      input: { kind: 'choice', layout: 'tiles', options: [{ key: 'piano', label: 'Piano' }, { key: 'organ', label: 'Organ' }, { key: 'harp', label: 'Harp' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'piano', awardMilli: '10000' } }] },
    { key: 'physical', stages: [{ key: 'sculpture', kind: 'challenge', prompt: 'Living Sculpture: together, build the Eiffel Tower out of people. The host judges each player.', durationMs: 120_000, maxAwardMilli: '10000' }] },
    { key: 'finale', stages: [{ key: 'last', kind: 'collect', prompt: 'Shared finale: how many sides does a hexagon have?', durationMs: 20_000,
      input: { kind: 'choice', layout: 'tiles', options: [{ key: 'five', label: '5' }, { key: 'six', label: '6' }, { key: 'eight', label: '8' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'six', awardMilli: '10000' } },
      { key: 'results', kind: 'scoreboard', prompt: 'Results: both routes finish here', show: 'players', durationMs: null }] },
  ],
  edges: [
    { key: 'opening-to-choose', from: 'opening', to: 'choose' },
    { key: 'choose-music', from: 'choose', to: 'music', option: 'music' },
    { key: 'choose-physical', from: 'choose', to: 'physical', option: 'physical' },
    { key: 'music-to-finale', from: 'music', to: 'finale' },
    { key: 'physical-to-finale', from: 'physical', to: 'finale' },
  ],
});

export const builtInGames: readonly { key: string; description: string; definition: GameDefinition }[] = [
  { key: 'timed-quiz', description: 'Timed questions with tiles and a list, an ordering round and a writing round. The host can add time, change it or close early.', definition: timedQuiz },
  { key: 'friday-night-chaos', description: 'The party votes on a route: Music Mayhem or Living Sculpture. Both routes end in the same finale.', definition: fridayNightChaos },
  { key: 'team-party', description: 'Two random teams with captains, a solo round, one player against the rest, then players pick new teams and vote.', definition: teamParty },
  { key: 'picture-party', description: 'Players answer by uploading pictures, GIFs or short videos, shown to everyone at the reveal.', definition: pictureParty },
  { key: 'first-reliable-game', description: 'Untimed quiz question, a host-judged challenge and a writing round. The host closes each stage.', definition: preparedGame },
];

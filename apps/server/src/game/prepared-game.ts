import { parseDefinition } from './definition.js';

// Server-only fixture for the first command slice; not a seed or public endpoint.
export const preparedGame = parseDefinition({
  formatVersion: 1, title: 'First reliable game', startNodeKey: 'quiz',
  nodes: [
    { key: 'quiz', stages: [{ key: 'answer', kind: 'collect', prompt: 'Which city is the capital of Australia?', durationMs: null,
      input: { kind: 'choice', options: [{ key: 'sydney', label: 'Sydney' }, { key: 'canberra', label: 'Canberra' }] },
      scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000' } }] },
    { key: 'challenge', stages: [{ key: 'perform', kind: 'challenge', prompt: 'Build a living sculpture. The host judges each player.', durationMs: null, maxAwardMilli: '50000' }] },
    { key: 'joke', stages: [{ key: 'write', kind: 'collect', prompt: 'Write your best excuse for being late.', durationMs: null,
      input: { kind: 'text', maxLength: 240 }, scoring: { kind: 'none' } }] },
  ],
  edges: [{ key: 'quiz-to-challenge', from: 'quiz', to: 'challenge' }, { key: 'challenge-to-joke', from: 'challenge', to: 'joke' }],
});

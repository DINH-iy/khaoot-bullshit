import { describe, expect, it } from 'vitest';
import { SessionViewSchema } from '@party/contracts';
import { importDefinition } from '../../src/authoring/import.js';
import { inspectDefinition } from '../../src/authoring/drafts.js';
import { contentHash } from '../../src/game/definition.js';
import { viewPresentation } from '../../src/game/views.js';

const game = (look: unknown, sceneLook?: unknown) => JSON.stringify({ title: 'Styled', look, scenes: [
  { id: 'hello', type: 'cutscene', title: 'Hi', text: 'Welcome', ...(sceneLook ? { look: sceneLook } : {}) },
  { id: 'q', type: 'quiz', question: 'Two plus two?', answers: ['3', '4'], correct: '4' },
] });
const look = {
  texts: { 'answer.saved': 'Locked in, {name}!', 'timer.left': 'Hurry: {time}' },
  theme: { preset: 'neon', colors: { accent: '#ff00aa', answers: ['#111111', '#222222', '#333333'] }, radius: 4, background: 'dots' },
  animations: { sceneEnter: { preset: 'spin' }, answerSaved: { name: 'Jump', custom: { keyframes: [{ at: 0, y: 0 }, { at: .5, y: -30, scale: 1.2 }, { at: 1, y: 0 }], durationMs: 600, easing: 'springy' } } },
};

describe('a game’s own look', () => {
  it('imports and keeps the game’s and a scene’s texts, style and animations', () => {
    const definition = importDefinition(game(look, { texts: { 'wait.screen': 'Eyes on the TV' }, theme: { preset: 'pub' } }))!;
    const { issues, definition: valid } = inspectDefinition(definition);
    expect(issues).toEqual([]);
    expect(valid!.presentation).toEqual(look);
    expect(valid!.nodes[0]!.stages[0]!.presentation).toEqual({ texts: { 'wait.screen': 'Eyes on the TV' }, theme: { preset: 'pub' } });
  });

  it('refuses anything that is not a known text, moment or plain value, so no code can get in', () => {
    const bad = [
      { texts: { 'made.up': 'x' } },
      { texts: { 'answer.saved': 'x'.repeat(401) } },
      { theme: { colors: { accent: 'red; background: url(https://evil.example)' } } },
      { theme: { css: 'body { display: none }' } },
      { theme: { radius: 400 } },
      { animations: { explode: { preset: 'spin' } } },
      { animations: { sceneEnter: { custom: { keyframes: [{ at: 0 }], durationMs: 100, easing: 'smooth' } } } },
      { animations: { sceneEnter: { custom: { keyframes: [{ at: 0, transform: 'skew(9deg)' }, { at: 1 }], durationMs: 100, easing: 'smooth' } } } },
      { script: 'alert(1)' },
    ];
    for (const entry of bad) expect(inspectDefinition(importDefinition(game(entry))).issues.length, JSON.stringify(entry)).toBeGreaterThan(0);
  });

  it('changes the content hash only when the look changes', () => {
    const plain = inspectDefinition(importDefinition(game(undefined))).definition!;
    const styled = inspectDefinition(importDefinition(game(look))).definition!;
    expect(contentHash(plain)).not.toBe(contentHash(styled));
    expect(contentHash(plain)).toBe(contentHash(inspectDefinition(importDefinition(game(undefined))).definition!));
  });

  it('shows the room the scene’s changes on top of the game’s, key by key', () => {
    const view = viewPresentation({ texts: { 'answer.saved': 'Game', 'timer.up': 'Done' }, theme: { preset: 'neon' }, animations: { reveal: { preset: 'pop' } } },
      { texts: { 'answer.saved': 'Scene' }, theme: { radius: 0 } });
    expect(view).toEqual({ texts: { 'answer.saved': 'Scene', 'timer.up': 'Done' }, animations: { reveal: { preset: 'pop' } }, themes: [{ preset: 'neon' }, { radius: 0 }] });
    expect(viewPresentation(undefined, undefined)).toEqual({ texts: {}, animations: {}, themes: [] });
    expect(SessionViewSchema.shape.presentation.safeParse(view).success).toBe(true);
  });
});

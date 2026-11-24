import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANIMATION_PRESETS, AWARD_RULES, HEAD_TO_HEAD_KEYS, MINIGAME_KEYS, MINIGAME_SCORING_KINDS, MINIGAME_TIEBREAKS, MinigameSettingsSchemas, MOMENTS, PHONE_MENU_ACTIONS, PHONE_MENU_GLYPHS, RevealEasingSchema, THEME_PRESETS, ThemeSchema } from '@party/contracts';

// The instructions the app copies for an AI ("Copy instructions for an AI") must know every
// feature an author can use, or AI-made games silently miss them. When a feature is added,
// this test names what the instructions do not mention yet.
const guide = readFileSync(new URL('../../../../docs/guides/importing-games.md', import.meta.url), 'utf8');
const instructions = guide.slice(guide.indexOf('<!-- ai-instructions:start -->'), guide.indexOf('<!-- ai-instructions:end -->'));
// A word counts as mentioned as a JSON value ("word") or as code (`word`).
const missing = (words: readonly string[]) => words.filter(word => !instructions.includes(`"${word}"`) && !instructions.includes(`\`${word}\``));
const quoted = (words: readonly string[]) => words;
const optionsOf = (field: unknown): string[] => {
  // An optional enum field of the theme: its values (zod keeps them on the inner enum).
  const inner = (field as { unwrap?: () => unknown }).unwrap?.() ?? field;
  const options = (inner as { options?: unknown }).options;
  return Array.isArray(options) ? options.filter((value): value is string => typeof value === 'string') : [];
};

describe('the instructions for an AI know every feature', () => {
  it('every scene type', () => {
    expect(missing(quoted(['cutscene', 'quiz', 'poll', 'order', 'writing', 'upload', 'vote', 'challenge', 'duel', 'party-choice', 'scoreboard', 'drawing', 'minigame', 'minigame-draw', 'pick-teams']))).toEqual([]);
  });
  it('every minigame and every head-to-head game', () => {
    expect(missing(quoted([...MINIGAME_KEYS, ...HEAD_TO_HEAD_KEYS]))).toEqual([]);
  });
  it('every minigame settings field and reveal easing option', () => {
    for (const game of MINIGAME_KEYS) {
      expect(missing(Object.keys(MinigameSettingsSchemas[game].shape)), game).toEqual([]);
    }
    expect(missing(RevealEasingSchema.options)).toEqual([]);
  });
  it('the tie rule of minigames, closeness scoring and their choices', () => {
    expect(missing(['tiebreak', ...MINIGAME_TIEBREAKS])).toEqual([]);
    expect(missing(['scoring', ...MINIGAME_SCORING_KINDS, 'distance'])).toEqual([]);
  });
  it('the phone menu icon setting, actions and icon choices', () => {
    expect(missing(['phoneMenuIcons', ...PHONE_MENU_ACTIONS, ...PHONE_MENU_GLYPHS])).toEqual([]);
  });
  it('the game-wide extras: wheels, awards (every rule), side games, places and teams', () => {
    expect(missing(quoted(['wheels', 'spin', 'wheelClear', 'awards', 'sideGames', 'chips', 'openInvites', 'quickTime', 'idleCloseMinutes', 'autoRevealSeconds', 'birthdayVote', 'voteMode', 'voteLimit', 'resultCards', 'countdownSeconds', 'matchSeconds', 'ballBehavior', 'rollingResistance', 'railBounce', 'stopSpeed', 'start', 'side', 'percent', 'felt', 'shotSeconds', 'explain', 'places', 'inTeams', 'look', 'media', 'music']))).toEqual([]);
    expect(missing(quoted([...AWARD_RULES]))).toEqual([]);
  });
  it('every look: style presets, every theme setting and its choices, and every animation', () => {
    expect(missing(quoted(Object.keys(THEME_PRESETS)))).toEqual([]);
    const fields = Object.keys(ThemeSchema.shape);
    expect(missing(quoted(fields))).toEqual([]);
    expect(missing(quoted(fields.flatMap(field => optionsOf(ThemeSchema.shape[field as keyof typeof ThemeSchema.shape]))))).toEqual([]);
    expect(missing(quoted([...Object.keys(ANIMATION_PRESETS), ...Object.keys(MOMENTS)]))).toEqual([]);
  });
  it('host points on writing, upload and drawing rounds', () => {
    expect(instructions).toMatch(/Points on `"writing"`, `"upload"` and `"drawing"`: add `"maxPoints"/);
  });
  it('the intro before a round: its points, picture and shared-screen-only setting', () => {
    expect(missing(['explain', 'showPoints', 'screenOnly', 'picture'])).toEqual([]);
  });
  it('asks the user its questions before writing the game', () => {
    expect(instructions).toMatch(/ask/i);
    expect(instructions).toMatch(/wait for (the|their) answers/i);
  });
});

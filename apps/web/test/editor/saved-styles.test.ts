import { describe, expect, it } from 'vitest';
import { sameLook } from '../../src/editor/look/saved-styles.js';

// Whether a look is exactly a saved style decides when Look & feel asks before a change.
describe('a look that is exactly a saved style', () => {
  it('matches whatever order the settings were written in, and ignores unset or empty parts', () => {
    expect(sameLook({ preset: 'neon', font: 'serif', colors: { background: '#336699', text: '#ffffff' } },
      { colors: { text: '#ffffff', background: '#336699' }, font: 'serif', preset: 'neon', headingFont: undefined })).toBe(true);
    expect(sameLook({ preset: 'neon', colors: {} }, { preset: 'neon' })).toBe(true);
    expect(sameLook(undefined, {})).toBe(true);
  });
  it('differs as soon as any value differs, including the order of answer colours', () => {
    expect(sameLook({ preset: 'neon' }, { preset: 'neon', font: 'serif' })).toBe(false);
    expect(sameLook({ colors: { answers: ['#111111', '#222222'] } }, { colors: { answers: ['#222222', '#111111'] } })).toBe(false);
    expect(sameLook({ font: { id: 'a3c5d1f0-0000-4000-8000-000000000001', name: 'Tiny5' } }, { font: { id: 'a3c5d1f0-0000-4000-8000-000000000002', name: 'Tiny5' } })).toBe(false);
  });
});

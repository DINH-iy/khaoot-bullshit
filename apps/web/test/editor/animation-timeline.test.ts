import { describe, expect, it } from 'vitest';
import { ANIMATION_PRESETS, type CustomAnimation } from '@party/contracts';
import { describeAnimation } from '../../src/editor/look/timeline.js';

const base: CustomAnimation = { keyframes: [{ at: 0, opacity: 0, y: 40 }, { at: 1, opacity: 1, y: 0 }], durationMs: 450, easing: 'ease-out' };

describe('an animation in words (next to its timeline)', () => {
  it('says what changes from the first block to the last, how long and how it moves', () => {
    expect(describeAnimation(base, false)).toBe('Fades in and rises · 0.45 s, slows down');
  });
  it('fills a block’s missing values from the block before, as the animation plays them', () => {
    // The end block leaves y out: it stays at 40, so nothing rises.
    expect(describeAnimation({ ...base, keyframes: [{ at: 0, opacity: 0, y: 40 }, { at: 1, opacity: 1 }] }, false)).toBe('Fades in · 0.45 s, slows down');
  });
  it('names a list that comes one after another, and repeats', () => {
    expect(describeAnimation({ ...base, staggerMs: 80, repeat: 2 }, true)).toBe('One after another, each fades in and rises · 0.45 s, 2×, slows down');
    // Without time between items the list moves as one.
    expect(describeAnimation({ ...base, staggerMs: 0 }, true)).toBe('Fades in and rises · 0.45 s, slows down');
  });
  it('calls movement that comes back to where it started a wiggle', () => {
    const shake: CustomAnimation = { keyframes: [{ at: 0, x: 0 }, { at: .5, x: 10 }, { at: 1, x: 0 }], durationMs: 300, easing: 'linear' };
    expect(describeAnimation(shake, false)).toBe('Wiggles · 0.30 s, steady');
  });
  it('describes every ready-made animation with words, not a blank', () => {
    for (const preset of Object.values(ANIMATION_PRESETS)) if (preset.animation) expect(describeAnimation(preset.animation, false)).toMatch(/^[A-Z].+ · \d\.\d\d s/);
  });
});

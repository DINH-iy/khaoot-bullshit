import { describe, expect, it } from 'vitest';
import { answerFit } from '../../src/room/answer-fit.js';

describe('answer tiles sized by their longest word', () => {
  it('measures the longest single word across all answers', () => {
    expect(answerFit(['Friday', 'Monday'])).toEqual({ '--longest-word': '6' });
    expect(answerFit(['A cat', 'Verantwoordelijkheid is key'])).toEqual({ '--longest-word': '20' });
  });
  it('counts letters, not bytes, and stays bounded', () => {
    expect(answerFit(['Ünïcødé', '🎉🎉'])).toEqual({ '--longest-word': '7' });
    expect(answerFit(['x'.repeat(500)])).toEqual({ '--longest-word': '60' });
    expect(answerFit([])).toEqual({ '--longest-word': '0' });
  });
});

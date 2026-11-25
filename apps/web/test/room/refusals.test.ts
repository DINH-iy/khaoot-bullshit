import { describe, expect, it } from 'vitest';
import { GameErrorCodeSchema } from '@party/contracts';
import { refusalText } from '../../src/room/refusals.js';

describe('refused actions on the phone', () => {
  it('never shows a server code: every game code has its own words', () => {
    for (const code of GameErrorCodeSchema.options) {
      const text = refusalText(new Error(code), 'notConfirmed');
      expect(text, code).not.toMatch(/[A-Z]{2,}_?[A-Z]/);
      expect(text.length, code).toBeGreaterThan(10);
    }
    expect(refusalText(new Error('TOO_LATE'), 'notConfirmed')).toBe('Time was up before your answer reached the server.');
  });

  it('gives an unknown code a general message, and keeps words that are already readable', () => {
    expect(refusalText(new Error('SOMETHING_NEW'), 'notConfirmed')).toBe('That did not work. Try again.');
    expect(refusalText(new Error('Invalid server reply'), 'notConfirmed')).toBe('Invalid server reply');
    expect(refusalText('not an error', 'syncFailed')).toBe('Could not synchronize.');
  });
});

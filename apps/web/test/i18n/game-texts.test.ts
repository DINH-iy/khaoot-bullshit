import { describe, expect, it } from 'vitest';
import { TEXT_DEFAULTS } from '@party/contracts';
import { buildLook, standardText } from '../../src/presentation/look.js';

describe('the game’s texts in the phone’s language', () => {
  it('shows the standard texts in the chosen language, with placeholders filled', () => {
    expect(buildLook(undefined, 'nl').text('lobby.playerTitle')).toBe('Je doet mee!');
    expect(buildLook(undefined, 'de').text('progress.answered', { count: 2, total: 5 })).toBe('2 von 5 haben geantwortet');
    expect(buildLook(undefined, 'en').text('answer.saved')).toBe(TEXT_DEFAULTS['answer.saved']);
  });
  it('keeps a text the author changed exactly as written, in every language', () => {
    const look = { texts: { 'answer.saved': 'Locked in, good luck!' } };
    for (const language of ['en', 'nl', 'de', 'ro'] as const) expect(buildLook(look, language).text('answer.saved')).toBe('Locked in, good luck!');
    expect(buildLook(look, 'nl').text('answer.submit')).toBe('Antwoord opslaan');
  });
  it('has every standard text in every language, minigame explanations included', () => {
    for (const key of Object.keys(TEXT_DEFAULTS) as (keyof typeof TEXT_DEFAULTS)[]) for (const language of ['nl', 'de', 'ro'] as const)
      expect(standardText(key, language), `${key} in ${language}`).toBeTruthy();
    expect(standardText('minigame.how.bus', 'nl')).toContain('rood of zwart');
  });
});

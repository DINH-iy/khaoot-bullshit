import { describe, expect, it } from 'vitest';
import { defaultLook, LOOK_PART_NAMES, LOOK_PARTS, PlayerLookSchema } from '../src/players.js';

describe('a player look', () => {
  it('still accepts looks saved before facial hair, piercings and tattoos existed', () => {
    const old = { color: 2, body: 'cat', eyes: 'wink', mouth: 'grin', hat: 'crown', extra: 'glasses' };
    expect(PlayerLookSchema.parse(old)).toEqual(old);
    expect(PlayerLookSchema.safeParse(defaultLook('player-1')).success).toBe(true);
  });

  it('takes the new parts only from their own lists', () => {
    expect(PlayerLookSchema.safeParse({ ...defaultLook('a'), beard: 'full', piercing: 'septum', marks: 'tear' }).success).toBe(true);
    expect(PlayerLookSchema.safeParse({ ...defaultLook('a'), beard: 'tear' }).success).toBe(false);
    expect(PlayerLookSchema.safeParse({ ...defaultLook('a'), marks: '<img src=x>' }).success).toBe(false);
  });

  it('names every part', () => {
    for (const part of Object.keys(LOOK_PARTS) as (keyof typeof LOOK_PARTS)[]) {
      for (const value of LOOK_PARTS[part]) expect((LOOK_PART_NAMES[part].names as Record<string, string>)[value], `${part}.${value}`).toBeTruthy();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { PersonKeySchema } from '@party/contracts';
import { newPersonKey, openPersonKey, personKeyHash, sealPersonKey } from '../../src/people/keys.js';
import { tokenHash } from '../../src/rooms/security.js';

const secret = 'a'.repeat(64);

describe('personal keys', () => {
  it('are readable keys in the shared format, and different every time', () => {
    const keys = Array.from({ length: 200 }, newPersonKey);
    for (const key of keys) expect(PersonKeySchema.parse(key)).toBe(key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('match however they are typed', () => {
    const key = 'K7QM-4XPT-9RWD'; const hash = tokenHash(key);
    for (const typed of ['K7QM-4XPT-9RWD', 'k7qm4xpt9rwd', ' k7qm 4xpt 9rwd ', 'K7QM - 4XPT - 9RWD']) expect(personKeyHash(typed)).toBe(hash);
    // Letters that look like digits read as those digits.
    expect(personKeyHash('AB0C-D11E-F1GH')).toBe(personKeyHash('ABOC-DILE-FlGH'));
  });
  it('never look up anything that cannot be a key', () => {
    for (const typed of ['', 'K7QM-4XPT-9RW', 'K7QM-4XPT-9RWDX', 'K7QM-4XPT-9RW!', 'K7QM-4XPT-9RWU', 'x'.repeat(42)]) expect(personKeyHash(typed)).toBeNull();
  });
  it('keep working for personal links made before keys', () => {
    const token = 'b'.repeat(43);
    expect(personKeyHash(token)).toBe(tokenHash(token));
  });
  it('can be opened again only with the same server secret, and are not stored readable', () => {
    const key = newPersonKey(); const sealed = sealPersonKey(secret, key);
    expect(sealed).not.toContain(key.replaceAll('-', '').slice(0, 6));
    expect(sealed.length).toBeLessThanOrEqual(200);
    expect(openPersonKey(secret, sealed)).toBe(key);
    expect(openPersonKey('c'.repeat(64), sealed)).toBeNull();
    expect(sealPersonKey(secret, key)).not.toBe(sealed);
  });
  it('refuse a tampered or missing sealed copy', () => {
    const sealed = sealPersonKey(secret, newPersonKey());
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
    expect(openPersonKey(secret, tampered)).toBeNull();
    expect(openPersonKey(secret, null)).toBeNull();
    expect(openPersonKey(secret, 'not-sealed')).toBeNull();
  });
});

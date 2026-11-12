import { expect, it } from 'vitest';
import { publicJoinUrl } from '../src/network/join-qr.js';

it('builds only the public room link, with no host/display token or arbitrary query parameters', () => {
  expect(publicJoinUrl('https://party.example', 'ABC234')).toBe('https://party.example/?code=ABC234');
  for (const origin of ['javascript:alert(1)', 'https://party.example/?access=secret', 'https://party.example/#access=secret']) expect(() => publicJoinUrl(origin, 'ABC234')).toThrow();
  expect(() => publicJoinUrl('https://party.example', 'ABC234&access=secret')).toThrow();
});

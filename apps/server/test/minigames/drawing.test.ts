import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { circleScore, DrawingSchema, MAX_DRAWING_POINTS } from '@party/contracts';
import { cleanPicture } from '../../src/assets/media.js';
import { relayPlan } from '../../src/minigames/relay.js';
import { minigameOutcome } from '../../src/minigames/outcome.js';
import type { TeamContext } from '../../src/game/teams.js';

const ring = (points: number, radius: (angle: number) => number, turns = 1) => Array.from({ length: points }, (_, index) => {
  const angle = (index / (points - 1)) * 2 * Math.PI * turns; return [Math.round(500 + radius(angle) * Math.cos(angle)), Math.round(500 + radius(angle) * Math.sin(angle))];
}).flat();

/** A tiny valid PNG with extra metadata chunks, built by hand. */
function png(width: number, height: number, extra: [string, Buffer][] = []) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (bytes: Buffer) => { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length); head.write(type, 4, 'latin1'); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(type, 'latin1'), data]))); return Buffer.concat([head, data, tail]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = deflateSync(Buffer.alloc((width * 3 + 1) * height));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), ...extra.map(([type, data]) => chunk(type, data)), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))]);
}

describe('drawings', () => {
  it('scores a round circle near 100%, and a wobbly, open or tiny one much lower', () => {
    const perfect = circleScore(ring(120, () => 300));
    expect(perfect).toBeGreaterThan(950);
    expect(circleScore(ring(120, angle => 300 + 60 * Math.sin(5 * angle)))).toBeLessThan(perfect - 150);
    expect(circleScore(ring(120, () => 300, 0.5))).toBeLessThan(400); // half a circle
    expect(circleScore(ring(120, () => 30))).toBe(0); // a dot
    expect(circleScore([500, 500, 510, 510])).toBe(0);
  });

  it('accepts only bounded strokes on the 1000 × 1000 square', () => {
    expect(DrawingSchema.safeParse({ v: 1, strokes: [{ c: 0, w: 10, p: [0, 0, 1000, 1000] }] }).success).toBe(true);
    expect(DrawingSchema.safeParse({ v: 1, strokes: [{ c: 0, w: 10, p: [0, 0, 1001, 5] }] }).success).toBe(false);
    expect(DrawingSchema.safeParse({ v: 1, strokes: [{ c: 99, w: 10, p: [0, 0] }] }).success).toBe(false);
    expect(DrawingSchema.safeParse({ v: 1, strokes: [{ c: 0, w: 10, p: [0, 0, 5] }] }).success).toBe(false);
    expect(DrawingSchema.safeParse({ v: 1, strokes: [{ c: 0, w: 10, p: [0, 0], href: 'javascript:alert(1)' }] }).success).toBe(false);
    const heavy = Array.from({ length: 7 }, () => ({ c: 0, w: 4, p: Array.from({ length: 2000 }, (_, index) => index % 1000) }));
    expect(heavy.reduce((sum, stroke) => sum + stroke.p.length / 2, 0)).toBeGreaterThan(MAX_DRAWING_POINTS);
    expect(DrawingSchema.safeParse({ v: 1, strokes: heavy }).success).toBe(false);
  });

  it('keeps only the image of a picture: text, location and other metadata chunks are dropped', () => {
    const tagged = png(64, 64, [['tEXt', Buffer.from('GPS\u000052.37,4.89')], ['eXIf', Buffer.from('camera')]]);
    const clean = cleanPicture(tagged)!;
    expect(clean).not.toBeNull();
    expect(clean.includes(Buffer.from('tEXt'))).toBe(false);
    expect(clean.includes(Buffer.from('eXIf'))).toBe(false);
    expect(clean.length).toBeLessThan(tagged.length);
    expect(cleanPicture(png(2048, 64))).toBeNull(); // too big
    expect(cleanPicture(Buffer.from('<svg onload="alert(1)"/>'))).toBeNull();
    expect(cleanPicture(tagged.subarray(0, tagged.length - 12))).toBeNull(); // cut off
  });

  it('gives every team in Pass the pencil the same number of turns and ranks pictures by votes', () => {
    const a = 'a0000000-0000-4000-8000-000000000001'; const b = 'a0000000-0000-4000-8000-000000000002';
    const p = (n: number) => `10000000-0000-4000-8000-00000000000${n}`;
    const context: TeamContext = { lineupId: 'b0000000-0000-4000-8000-000000000001', answers: 'everyone', points: 'team',
      teamOf: new Map([[p(1), a], [p(2), a], [p(3), b], [p(4), b], [p(5), b]]), members: new Map([[a, [p(1), p(2)]], [b, [p(3), p(4), p(5)]]]), captainOf: new Map() };
    const run = { startsAt: '2026-11-13T10:00:00.000Z', goAt: null, doorsMilli: null };
    const plan = relayPlan(context, { secondsPerTurn: 10, voteSeconds: 30 }, run);
    expect(plan.turns).toBe(3);
    expect([0, 1, 2].map(turn => plan.drawerOf(a, turn))).toEqual([p(1), p(2), p(1)]); // the small team starts over
    expect([0, 1, 2].map(turn => plan.drawerOf(b, turn))).toEqual([p(3), p(4), p(5)]);
    expect(new Date(plan.voteAt).toISOString()).toBe('2026-11-13T10:00:30.000Z');
    expect(plan.turnAt(Date.parse('2026-11-13T10:00:15.000Z'))).toBe(1);
    const vote = (playerId: string, teamId: string) => ({ playerId, teamId: null, value: { kind: 'minigame', value: 0, teamId } });
    const outcome = minigameOutcome({ game: 'relay-drawing', settings: { secondsPerTurn: 10, voteSeconds: 30 }, placementMilli: ['10000', '5000'], teamResult: 'average' },
      [vote(p(1), b), vote(p(2), b), vote(p(3), a)], context, 'c0000000-0000-4000-8000-000000000001');
    expect(outcome.entries).toEqual([{ playerId: null, teamId: b, value: 2, place: 1 }, { playerId: null, teamId: a, value: 1, place: 2 }]);
    expect(outcome.awards.map(award => [award.teamId, award.amountMilli])).toEqual([[a, 5000n], [b, 10000n]]);
  });
});

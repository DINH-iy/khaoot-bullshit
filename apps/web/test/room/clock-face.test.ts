import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClockFace } from '../../src/room/stage-timer.js';

// The slice is the time left; time runs out from the top. With three quarters left, a clockwise
// clock has lost the part from 12 to 3 o'clock, a counter-clockwise one the part from 9 to 12.
const slice = (clockwise: boolean, left: number) => renderToStaticMarkup(createElement(ClockFace, { left, total: 20_000, ending: false, up: false, clockwise })).match(/<path class="timer-clock-slice" d="([^"]+)"/)?.[1];

describe('the timer clock', () => {
  it('runs out clockwise by default, like a clock hand', () => {
    expect(slice(true, 15_000)).toBe('M16 16 L29.00 16.00 A13 13 0 1 1 16 3 Z');
  });
  it('can run out counter-clockwise', () => {
    expect(slice(false, 15_000)).toBe('M16 16 L16 3 A13 13 0 1 1 3.00 16.00 Z');
  });
  it('is a full circle at the start and has no slice when time is up', () => {
    expect(slice(true, 20_000)).toBeUndefined();
    expect(renderToStaticMarkup(createElement(ClockFace, { left: 20_000, total: 20_000, ending: false, up: false }))).toContain('<circle class="timer-clock-slice"');
    expect(renderToStaticMarkup(createElement(ClockFace, { left: 0, total: 20_000, ending: false, up: true }))).not.toContain('timer-clock-slice');
  });
});

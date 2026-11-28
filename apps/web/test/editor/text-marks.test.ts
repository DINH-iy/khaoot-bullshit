import { describe, expect, it } from 'vitest';
import { formatSelection, moveTextMarks } from '../../src/editor/scene/text-marks.js';

describe('scene text formatting', () => {
  it('patches selected letters while preserving overlapping styles and unaffected text', () => {
    const marks = [{ start: 1, end: 4, color: '#112233' }, { start: 6, end: 8, font: 'mono' as const }];
    const italic = formatSelection(marks, { start: 2, end: 7 }, { italic: true });
    expect(italic).toEqual([
      { start: 1, end: 2, color: '#112233' },
      { start: 2, end: 4, color: '#112233', italic: true },
      { start: 4, end: 6, italic: true },
      { start: 6, end: 7, font: 'mono', italic: true },
      { start: 7, end: 8, font: 'mono' },
    ]);
    expect(formatSelection(italic, { start: 3, end: 7 }, null)).toEqual([
      { start: 1, end: 2, color: '#112233' },
      { start: 2, end: 3, color: '#112233', italic: true },
      { start: 7, end: 8, font: 'mono' },
    ]);
  });

  it('keeps formatting on the original letters when inserting or deleting identical neighbors', () => {
    const marks = [{ start: 2, end: 3, bold: true }];
    expect(moveTextMarks(marks, 'aaaa', 'aaaaa', 3)).toEqual([{ start: 3, end: 4, bold: true }]);
    expect(moveTextMarks(marks, 'aaaa', 'aaa', 1)).toEqual([{ start: 1, end: 2, bold: true }]);
  });

  it('extends the typed style when replacing a formatted selection and drops deleted styles', () => {
    const marks = [{ start: 0, end: 2, underline: true }, { start: 3, end: 4, italic: true }];
    expect(moveTextMarks(marks, 'ab c', 'xy c', 2)).toEqual(marks);
    expect(moveTextMarks(marks, 'ab c', 'ab ', 3)).toEqual([marks[0]]);
  });
});

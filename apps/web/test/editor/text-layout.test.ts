import { describe, expect, it } from 'vitest';
import { positionTextBox, sceneTextBoxes } from '../../src/editor/scene/text-edits.js';
import { placeTextBoxes } from '../../src/presentation/scene-text-layout.js';

const original = {
  key: 'stage',
  kind: 'info',
  textBoxes: [
    { key: 'a', text: 'First', layout: { width: 4 } },
    { key: 'b', text: 'Second\n\nLine', lines: 3, italic: true, layout: { width: 4, newRow: true, rotation: -12 } },
    { key: 'c', text: 'Third', layout: { width: 4, startColumn: 9, newRow: true } },
  ],
};

describe('moving and resizing boxes on a slide', () => {
  it('preserves a separate row while resizing the only box in it', () => {
    const next = positionTextBox(original, 'b', { row: 2, column: 3, width: 5 }, 4);
    const placements = placeTextBoxes(sceneTextBoxes(next));
    expect(placements.map(({ box, row, column, width }) => [box.key, row, column, width])).toEqual([
      ['a', 1, 1, 4], ['b', 2, 3, 5], ['c', 3, 9, 4],
    ]);
    expect(placements[1]?.box).toMatchObject({ text: 'Second\n\nLine', italic: true, lines: 4, layout: { rotation: -12 } });
  });

  it('inserts space when dropping on another box and keeps the others in order', () => {
    const next = positionTextBox(original, 'c', { row: 1, column: 1, width: 6 });
    const placements = placeTextBoxes(sceneTextBoxes(next));
    expect(placements.map(({ box, row, column, width }) => [box.key, row, column, width])).toEqual([
      ['c', 1, 1, 6], ['a', 2, 1, 4], ['b', 3, 1, 4],
    ]);
    expect(positionTextBox(next, 'c', { row: 1, column: 1, width: 6 })).toBe(next);
  });
});

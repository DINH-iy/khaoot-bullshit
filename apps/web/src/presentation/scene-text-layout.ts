import { SCENE_TEXT_GRID_COLUMNS, type SceneTextBox } from '@party/contracts';

export interface TextBoxPosition { row: number; column: number; width: number }
export interface PlacedTextBox extends TextBoxPosition { box: SceneTextBox }

export function placeTextBoxes(boxes: readonly SceneTextBox[]): PlacedTextBox[] {
  let row = 1;
  let nextColumn = 1;
  return boxes.map((box, index) => {
    const width = box.layout?.width ?? SCENE_TEXT_GRID_COLUMNS;
    const start = box.layout?.startColumn;
    let column = start ?? nextColumn;
    if (index > 0 && (box.layout?.newRow || column < nextColumn || column + width - 1 > SCENE_TEXT_GRID_COLUMNS)) {
      row++;
      column = start ?? 1;
    }
    nextColumn = column + width;
    return { box, row, column, width };
  });
}

export function lastTextBoxRow(placed: readonly PlacedTextBox[], key: string) {
  return new Set(placed.filter(entry => entry.box.key !== key).map(entry => entry.row)).size + 1;
}

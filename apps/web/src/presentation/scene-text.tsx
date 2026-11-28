import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { lastTextBoxRow, placeTextBoxes, type TextBoxPosition } from './scene-text-layout.js';
import { FONTS, SCENE_TEXT_GRID_COLUMNS, type SceneCharacterStyle, type SceneTextBox, type SceneTextStyle } from '@party/contracts';

export const usesSlideTypography = (kind: string) => ['info', 'challenge', 'collect'].includes(kind);

export function sceneTextProps(format: SceneTextStyle = {}, defaultSize: SceneTextStyle['size'] = 'body') {
  const { size = defaultSize, align = 'center', verticalAlign = 'top', font, scale, color, bold, italic, underline, strike, wrap = 'break-word', overflow = 'visible', lines, marks } = format;
  return {
    className: `scene-slide-text scene-text-${size} scene-text-${align}`,
    style: {
      '--box-font': font ? FONTS[font] : undefined,
      '--box-scale': scale === undefined ? undefined : scale / 100,
      '--box-color': color,
      '--box-weight': bold === false ? 400 : undefined,
      '--box-style': italic ? 'italic' : undefined,
      '--box-decoration': marks?.length ? undefined : decoration({ underline, strike }),
      '--box-white-space': wrap === 'none' ? 'pre' : 'pre-wrap',
      '--box-wrap': wrap === 'break-word' ? 'anywhere' : 'normal',
      '--box-overflow': overflow === 'scroll' ? 'auto' : overflow === 'clip' ? 'hidden' : 'visible',
      '--box-vertical': verticalAlign === 'top' ? undefined : verticalAlign === 'middle' ? 'safe center' : 'safe end',
      '--box-height': lines === undefined ? undefined : `${lines}lh`,
    } as CSSProperties,
    tabIndex: overflow === 'scroll' ? 0 : undefined,
  };
}

function decoration({ underline, strike }: SceneCharacterStyle = {}) {
  return [underline && 'underline', strike && 'line-through'].filter(Boolean).join(' ') || undefined;
}

export function SceneTextContent({ text, format, selection }: {
  text: string;
  format?: SceneTextStyle | undefined;
  selection?: { start: number; end: number } | undefined;
}) {
  const marks = format?.marks;
  const slice = (start: number, end: number) => {
    if (!selection || selection.start >= end || selection.end <= start) return text.slice(start, end);
    const from = Math.max(start, selection.start);
    const to = Math.min(end, selection.end);
    return <>{text.slice(start, from)}<span className="canvas-selected-text">{text.slice(from, to)}</span>{text.slice(to, end)}</>;
  };
  if (!marks?.length) return slice(0, text.length);
  let cursor = 0;
  const baseDecoration = decoration(format);
  return <>
    {marks.map(mark => {
      const gapStart = cursor;
      cursor = mark.end;
      return <Fragment key={mark.start}>
        {gapStart < mark.start && <span style={{ textDecorationLine: baseDecoration }}>{slice(gapStart, mark.start)}</span>}
        <span style={{
          color: mark.color, fontFamily: mark.font ? FONTS[mark.font] : undefined,
          fontSize: mark.scale === undefined ? undefined : `${100 * mark.scale / (format?.scale ?? 100)}%`,
          fontWeight: mark.bold === undefined ? undefined : mark.bold ? 'var(--slide-text-weight)' : 400,
          fontStyle: mark.italic === undefined ? undefined : mark.italic ? 'italic' : 'normal',
          textDecorationLine: decoration({ underline: mark.underline ?? format?.underline, strike: mark.strike ?? format?.strike }),
        }}>{slice(mark.start, mark.end)}</span>
      </Fragment>;
    })}
    {cursor < text.length && <span style={{ textDecorationLine: baseDecoration }}>{slice(cursor, text.length)}</span>}
  </>;
}

export function withoutMarks(format: SceneTextStyle | undefined): SceneTextStyle | undefined {
  if (!format?.marks) return format;
  const { marks: _marks, ...rest } = format;
  return rest;
}

export function SceneTextBoxes({ boxes, phoneColumns, renderBox }: {
  boxes: readonly SceneTextBox[] | undefined;
  phoneColumns?: boolean | undefined;
  renderBox?: (box: SceneTextBox, index: number, position: TextBoxPosition, lastRow: number) => ReactNode;
}) {
  const explicitLayout = boxes?.some(box => box.layout !== undefined);
  const displayed = renderBox || explicitLayout ? boxes : boxes?.filter(box => box.text.trim());
  if (!displayed?.length) return null;
  const placed = placeTextBoxes(displayed);
  return <div className="scene-text-grid" data-phone-columns={phoneColumns || undefined}
    style={{ '--text-grid-columns': SCENE_TEXT_GRID_COLUMNS } as CSSProperties}>
    {placed.map(({ box, row, column, width }, index) => {
      const empty = !renderBox && !box.text.trim();
      return <div key={box.key} className="scene-text-cell" data-empty={empty || undefined} aria-hidden={empty || undefined} style={{ gridColumn: `${column} / span ${width}`, gridRow: row, rotate: !renderBox && box.layout?.rotation ? `${box.layout.rotation}deg` : undefined }}>
        {renderBox ? renderBox(box, index, { row, column, width }, lastTextBoxRow(placed, box.key)) : !empty && <p {...sceneTextProps(box)}><SceneTextContent text={box.text} format={box} /></p>}
      </div>;
    })}
  </div>;
}

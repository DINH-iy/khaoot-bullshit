import { Children, Fragment, type CSSProperties, type ReactNode } from 'react';
import { placeTextBoxes } from './scene-text-layout.js';
import { FONTS, SCENE_TEXT_GRID_COLUMNS, type SceneCharacterStyle, type AnswerOption, type SceneTextBoxPlacement, type SceneTextBox, type SceneTextStyle } from '@party/contracts';

import { slideObjectStyle } from './slide-object.js';

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

export function AnswerOptionLabel({ option }: { option: Pick<AnswerOption, 'label' | 'marks'> }) {
  if (!option.marks?.length) return <>{option.label}</>;
  return <span className="answer-label"><SceneTextContent text={option.label} format={option} /></span>;
}

export function withAnswerTranslation<T extends Pick<AnswerOption, 'label' | 'marks'>>(option: T, label: string): T {
  if (label === option.label) return option;
  const { marks: _marks, ...other } = option;
  return { ...other, label } as T;
}

export function withoutMarks(format: SceneTextStyle | undefined): SceneTextStyle | undefined {
  if (!format?.marks) return format;
  const { marks: _marks, ...rest } = format;
  return rest;
}

type EditableBox = (box: SceneTextBox, index: number) => ReactNode;
type TextBoxContentProps = {
  boxes: readonly SceneTextBox[] | undefined;
  placeText?: string;
  renderBox?: EditableBox;
};

function boxContent(box: SceneTextBox, placeText: string) {
  return box.source === 'places' ? { ...box, text: placeText, marks: undefined } : box;
}

export function SceneTextBoxes({ boxes, phoneColumns, renderBox, placeText = '' }: TextBoxContentProps & {
  phoneColumns?: boolean | undefined;
}) {
  if (!boxes?.length) return null;
  const flow = boxes.filter(box => !box.placement).map(box => boxContent(box, placeText));
  const explicitLayout = flow.some(box => box.layout !== undefined);
  const displayed = renderBox || explicitLayout ? flow : flow.filter(box => box.text.trim());
  if (!displayed.length) return null;
  return <div className="scene-text-grid" data-phone-columns={phoneColumns || undefined}
    style={{ '--text-grid-columns': SCENE_TEXT_GRID_COLUMNS } as CSSProperties}>
    {placeTextBoxes(displayed).map(({ box, row, column, width }) => {
      const empty = !renderBox && !box.text.trim();
      return <div key={box.key} className="scene-text-cell" data-empty={empty || undefined} aria-hidden={empty || undefined}
        style={{ gridColumn: `${column} / span ${width}`, gridRow: row, rotate: !renderBox && box.layout?.rotation ? `${box.layout.rotation}deg` : undefined }}>
        {renderBox ? renderBox(box, boxes.findIndex(entry => entry.key === box.key))
          : !empty && <p {...sceneTextProps(box)}><SceneTextContent text={box.text} format={box} /></p>}
      </div>;
    })}
  </div>;
}

export function PositionedSlideText({ position, text, format, size, rotation = 0, as: Tag = 'p', id }: {
  position: SceneTextBoxPlacement;
  text: string;
  format: SceneTextStyle | undefined;
  size?: SceneTextStyle['size'];
  rotation?: number;
  as?: 'h2' | 'p';
  id?: string;
}) {
  const props = sceneTextProps(format, size);
  return <div className="scene-positioned-text-box" style={slideObjectStyle(position)}>
    <Tag {...props} id={id} style={{ ...props.style, rotate: `${rotation}deg` }}>
      <SceneTextContent text={text} format={format} />
    </Tag>
  </div>;
}

export function SlideTextLayer({ boxes, renderBox, placeText = '', children }: TextBoxContentProps & { children?: ReactNode }) {
  const positioned = boxes?.flatMap((box, index) => box.placement ? [{ box: boxContent(box, placeText), position: box.placement, index }] : []);
  const visible = renderBox ? positioned : positioned?.filter(({ box }) => box.text.trim());
  // The editor also needs the board when the first automatic box is moved.
  const primary = Children.toArray(children);
  if (!primary.length && !visible?.length && !renderBox) return null;
  return <div className="scene-slide-layer scene-slide-text-layer" data-editable={Boolean(renderBox) || undefined}>
    {primary}
    {visible?.map(({ box, position, index }) => {
      if (renderBox) return renderBox(box, index);
      return <PositionedSlideText key={box.key} position={position} text={box.text} format={box}
        {...(box.layout?.rotation === undefined ? {} : { rotation: box.layout.rotation })} />;
    })}
  </div>;
}

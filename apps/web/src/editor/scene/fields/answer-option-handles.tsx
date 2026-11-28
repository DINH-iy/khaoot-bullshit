import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MIN_ANSWER_HEIGHT_PERCENT, MIN_ANSWER_WIDTH_PERCENT, type AnswerOption, type AnswerPlacement } from '@party/contracts';
import { useTexts } from '../../../i18n/texts.js';
import { answerPlacementStyle } from '../../../presentation/slide-answers.js';
import { slidePercent } from '../../../presentation/slide-object.js';
import { ANSWER_PLACEMENT_TEXTS } from './answer-placement.text.js';
import { CanvasObjectHandle, type CanvasPoint } from './canvas-object-handle.js';

function measureAnswer(element: HTMLElement) {
  const slide = element.closest('.tv-screen');
  const board = slide?.querySelector(':scope > .scene-slide-answers')?.getBoundingClientRect();
  if (!board?.width || !board.height || !slide) return;
  const box = element.getBoundingClientRect();
  return { board, slide, position: {
    x: slidePercent((box.left - board.left + box.width / 2) * 100 / board.width),
    y: slidePercent((box.top - board.top + box.height / 2) * 100 / board.height),
    width: slidePercent(box.width * 100 / board.width, MIN_ANSWER_WIDTH_PERCENT),
    height: slidePercent(box.height * 100 / board.height, MIN_ANSWER_HEIGHT_PERCENT),
  } };
}

export function measureAnswerPlacement(preview: HTMLElement | null, key: string) {
  const element = preview?.querySelector<HTMLElement>(`[data-canvas-answer-key="${CSS.escape(key)}"]`);
  return element ? measureAnswer(element)?.position : undefined;
}

export function AnswerOptionHandles({ option, index, selected, select, change, accent, children }: {
  option: AnswerOption; index: number; selected: boolean; select: () => void;
  change: (placement: AnswerPlacement) => void; accent: string; children: ReactNode;
}) {
  const t = useTexts(ANSWER_PLACEMENT_TEXTS);
  const frame = useRef<HTMLLIElement>(null);
  const [preview, setPreview] = useState<AnswerPlacement>();
  const current = option.placement;
  const commit = (slide: Element, action: 'move' | 'resize', position: AnswerPlacement) => {
    const refocus = !current && frame.current?.contains(document.activeElement);
    change(position);
    if (refocus) requestAnimationFrame(() => slide.querySelector<HTMLButtonElement>(
      `[data-canvas-answer-key="${CSS.escape(option.key)}"] .canvas-box-handle.${action}`,
    )?.focus({ preventScroll: true }));
  };
  const start = (action: 'move' | 'resize', origin: CanvasPoint) => {
    const geometry = frame.current && measureAnswer(frame.current);
    if (!geometry) return;
    const { board, slide } = geometry;
    const initial = current ?? geometry.position;
    const position = (point: CanvasPoint): AnswerPlacement => {
      const dx = (point.x - origin.x) * 100 / board.width;
      const dy = (point.y - origin.y) * 100 / board.height;
      return action === 'move' ? { ...initial, x: slidePercent(initial.x + dx), y: slidePercent(initial.y + dy) }
        : { ...initial, width: slidePercent(initial.width + 2 * dx, MIN_ANSWER_WIDTH_PERCENT),
          height: slidePercent(initial.height + 2 * dy, MIN_ANSWER_HEIGHT_PERCENT) };
    };
    return { update: (point: CanvasPoint) => setPreview(position(point)),
      commit: (point: CanvasPoint) => { setPreview(undefined); commit(slide, action, position(point)); }, cancel: () => setPreview(undefined) };
  };
  const arrow = (action: 'move' | 'resize', x: number, y: number, shift: boolean) => {
    const geometry = frame.current && measureAnswer(frame.current);
    if (!geometry) return;
    const initial = current ?? geometry.position;
    const step = shift ? 5 : 1;
    commit(geometry.slide, action, action === 'move' ? {
      ...initial, x: slidePercent(initial.x + step * x), y: slidePercent(initial.y + step * y),
    } : { ...initial, width: slidePercent(initial.width + step * x, MIN_ANSWER_WIDTH_PERCENT),
      height: slidePercent(initial.height + step * y, MIN_ANSWER_HEIGHT_PERCENT) });
  };
  const geometry = !current && preview && frame.current ? measureAnswer(frame.current) : undefined;
  const board = geometry?.board;
  const editor = geometry && frame.current?.closest('.editor');
  const previewStyle = board && preview ? {
    left: board.left + (preview.x - preview.width / 2) * board.width / 100,
    top: board.top + (preview.y - preview.height / 2) * board.height / 100,
    width: preview.width * board.width / 100, height: preview.height * board.height / 100,
  } : undefined;
  return <li ref={frame} className={`canvas-answer canvas-box-frame${current ? ' scene-positioned-answer' : ''}`}
    style={{ '--option-accent': accent, ...(current ? answerPlacementStyle(preview ?? current) : {}) } as CSSProperties}
    data-canvas-answer-key={option.key} data-selected={selected || undefined}
    onFocus={select} onPointerDown={select}>
    {children}
    {(['move', 'resize'] as const).map(action => <CanvasObjectHandle key={action} action={action} label={t(action, { number: index + 1 })}
      description={t('keys')} select={select} start={point => start(action, point)} arrow={(x, y, shift) => arrow(action, x, y, shift)} />)}
    {previewStyle && editor && createPortal(<div className="canvas-box-preview" aria-hidden="true" style={previewStyle} />, editor)}
  </li>;
}

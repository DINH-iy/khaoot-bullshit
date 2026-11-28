import type { SceneCharacterStyle, SceneTextMark } from '@party/contracts';

type Span = { start: number; end: number };
const styleOf = ({ start: _start, end: _end, ...style }: SceneTextMark): SceneCharacterStyle => style;
const keys = ['font', 'scale', 'color', 'bold', 'italic', 'underline', 'strike'] as const;

function compact(marks: SceneTextMark[]) {
  const result: SceneTextMark[] = [];
  for (const mark of marks) {
    if (mark.start >= mark.end || keys.every(key => mark[key] === undefined)) continue;
    const previous = result.at(-1);
    if (previous?.end === mark.start && keys.every(key => mark[key] === previous[key])) previous.end = mark.end;
    else result.push({ ...mark });
  }
  return result;
}

/** Apply a patch to the selection while preserving individual styles on either side and within it. */
export function formatSelection(marks: readonly SceneTextMark[], { start, end }: Span, patch: SceneCharacterStyle | null) {
  const next: SceneTextMark[] = [];
  let cursor = start;
  for (const mark of marks) {
    if (mark.end <= start) { next.push(mark); continue; }
    if (mark.start >= end) {
      if (cursor < end) next.push({ start: cursor, end, ...patch });
      cursor = end;
      next.push(mark);
      continue;
    }
    if (mark.start < start) next.push({ ...mark, end: start });
    if (cursor < mark.start) next.push({ start: cursor, end: mark.start, ...patch });
    cursor = Math.min(end, mark.end);
    next.push({ ...(patch && styleOf(mark)), ...patch, start: Math.max(start, mark.start), end: cursor });
    if (mark.end > end) next.push({ ...mark, start: end });
  }
  if (cursor < end) next.push({ start: cursor, end, ...patch });
  return compact(next);
}

/** Carry range styles across a native text edit. New text inherits the replaced or preceding character. */
export function moveTextMarks(marks: SceneTextMark[], before: string, after: string, caret = after.length) {
  if (!marks.length || before === after) return marks;
  let afterEnd = caret;
  let beforeEnd = before.length - (after.length - caret);
  let start = 0;
  if (beforeEnd >= 0 && before.slice(beforeEnd) === after.slice(afterEnd)) {
    while (start < afterEnd && start < beforeEnd && before[start] === after[start]) start++;
  } else {
    while (start < after.length && before[start] === after[start]) start++;
    afterEnd = after.length;
    beforeEnd = before.length;
    while (afterEnd > start && beforeEnd > start && after[afterEnd - 1] === before[beforeEnd - 1]) {
      afterEnd--;
      beforeEnd--;
    }
  }
  const change = afterEnd - beforeEnd;
  const inherited = marks.find(mark => mark.start <= start && start < mark.end && beforeEnd > start)
    ?? marks.find(mark => mark.start < start && start <= mark.end);
  return compact([
    ...marks.filter(mark => mark.start < start).map(mark => ({ ...mark, end: Math.min(mark.end, start) })),
    ...(afterEnd > start && inherited ? [{ ...inherited, start, end: afterEnd }] : []),
    ...marks.filter(mark => mark.end > beforeEnd).map(mark => ({ ...mark, start: Math.max(mark.start, beforeEnd) + change, end: mark.end + change })),
  ]);
}

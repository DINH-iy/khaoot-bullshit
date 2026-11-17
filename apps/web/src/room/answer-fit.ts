import type { CSSProperties } from 'react';

/**
 * The length of the longest word in a set of answers, as a CSS variable. The answer
 * grids use it as their smallest column width, so answers sit side by side only when
 * every word fits, and stack one below the other otherwise: words never break in the
 * middle (unless one word is longer than a whole row).
 */
export function answerFit(labels: string[]): CSSProperties {
  const longest = Math.max(0, ...labels.flatMap(label => label.split(/\s+/)).map(word => [...word].length));
  return { '--longest-word': String(Math.min(longest, 60)) } as CSSProperties;
}

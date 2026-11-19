import { Fragment, type ReactNode } from 'react';

/**
 * A translated sentence with marked-up parts in it: `rich(t('step1', …), { copy: <strong>…</strong> })` puts each
 * `{name}` part where that language has it, so word order stays the translator's. Placeholders already filled by
 * `t()` are plain text by then; only the names given here become elements.
 */
export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/g).map((piece, index) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={index}>{name && name in parts ? parts[name] : piece}</Fragment>;
  });
}

/**
 * Light markup for longer translated texts (help pages): `**bold**`, `*emphasis*` and `[[Key]]` for a keyboard key.
 * Translators keep the marks around the words that need them; nothing else is interpreted (no HTML).
 */
export function marked(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[\[[^\]]+\]\])/g).map((piece, index) => {
    if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith('[[') && piece.endsWith(']]')) return <kbd key={index}>{piece.slice(2, -2)}</kbd>;
    if (piece.startsWith('*') && piece.endsWith('*') && piece.length > 2) return <em key={index}>{piece.slice(1, -1)}</em>;
    return <Fragment key={index}>{piece}</Fragment>;
  });
}

import { FaIcon, type IconName } from './icons.js';

// Answer marks as icons (route arrows, shapes): see icons.tsx for the drawings and their licence.

// A route arrow is the one arrow icon, turned to its direction (degrees, 0 = right).
const ARROWS: Record<string, number> = { '→': 0, '↘': 45, '↓': 90, '↙': 135, '←': 180, '↖': 225, '↑': 270, '↗': 315, '➜': 0 };
// The shape marks (see answerMark in the contracts): each its icon; ▲ is the play triangle turned upwards.
const SHAPES: Record<string, { icon: string; turn?: number }> = { '★': { icon: 'star' }, '●': { icon: 'circle' }, '▲': { icon: 'play', turn: -90 }, '■': { icon: 'square' },
  '◆': { icon: 'diamond' }, '♥\uFE0E': { icon: 'heart' }, '♥': { icon: 'heart' }, '✚': { icon: 'plus' }, '⬟': { icon: 'bolt' } };

const Svg = ({ name, turn = 0 }: { name: string; turn?: number }) => <FaIcon name={name as IconName} turn={turn} className="mark-icon" />;

/** What an answer mark shows: an arrow or shape icon, or the text itself (letters, numbers, the author's own marks). */
export function Mark({ text }: { text: string }) {
  if (text in ARROWS) return <Svg name="arrow-right" turn={ARROWS[text] ?? 0} />;
  const shape = SHAPES[text]; if (shape) return <Svg name={shape.icon} turn={shape.turn ?? 0} />;
  return <>{text}</>;
}

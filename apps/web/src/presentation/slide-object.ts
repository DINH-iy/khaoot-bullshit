import type { CSSProperties } from 'react';
import './slide-objects.css';

export interface SlideObjectPosition { x: number; y: number; width: number }

// Center coordinates and width use the same percentages on every slide surface.
export function slideObjectStyle({ x, y, width }: SlideObjectPosition): CSSProperties {
  return { left: `${x}%`, top: `${y}%`, width: `${width}%` };
}

export const slidePercent = (value: number, min = 0) => Math.min(100, Math.max(min, Math.round(value * 10) / 10));

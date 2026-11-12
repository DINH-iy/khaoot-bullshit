import type { PointerEvent as ReactPointerEvent } from 'react';
import { CARD_WIDTH, cardHeight, type Definition, type Positions } from './model.js';

const WIDTH = 200; const HEIGHT = 130;
/** A small overview of the whole flow. The frame shows what is on screen; click or drag to move there. */
export function Minimap({ definition, positions, view, canvas, selected, onMove }: {
  definition: Definition; positions: Positions; view: { x: number; y: number; zoom: number }; canvas: { width: number; height: number };
  selected: string[]; onMove: (center: { x: number; y: number }) => void;
}) {
  const boxes = definition.nodes.map(node => ({ key: node.key, at: positions[node.key], height: cardHeight(node) })).filter(entry => entry.at);
  if (boxes.length < 2) return null;
  const minX = Math.min(...boxes.map(box => box.at!.x)) - 120; const minY = Math.min(...boxes.map(box => box.at!.y)) - 120;
  const maxX = Math.max(...boxes.map(box => box.at!.x + CARD_WIDTH)) + 120; const maxY = Math.max(...boxes.map(box => box.at!.y + box.height)) + 120;
  const scale = Math.min(WIDTH / (maxX - minX), HEIGHT / (maxY - minY));
  const frame = { x: (-view.x / view.zoom - minX) * scale, y: (-view.y / view.zoom - minY) * scale, width: canvas.width / view.zoom * scale, height: canvas.height / view.zoom * scale };
  const jump = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onMove({ x: (event.clientX - rect.left) / scale + minX, y: (event.clientY - rect.top) / scale + minY });
  };
  return <svg className="minimap" width={WIDTH} height={HEIGHT} role="img" aria-label="Overview of the whole game. Click to move the view there."
    onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); jump(event); }}
    onPointerMove={event => { if (event.buttons) jump(event); }}>
    {boxes.map(box => <rect key={box.key} x={(box.at!.x - minX) * scale} y={(box.at!.y - minY) * scale} width={CARD_WIDTH * scale} height={box.height * scale} rx={2} className={selected.includes(box.key) ? 'mini-card on' : 'mini-card'} />)}
    <rect className="mini-frame" x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx={3} />
  </svg>;
}

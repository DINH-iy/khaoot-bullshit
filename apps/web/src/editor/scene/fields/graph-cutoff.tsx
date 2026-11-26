import { useRef, type PointerEvent } from 'react';
import type { GraphData } from '@party/contracts';
import { GraphChart } from '../../../minigames/draw-the-graph/graph-chart.js';

export function GraphCutoffChart({ graph, label, onMove }: {
  graph: GraphData; label: string; onMove?: ((fraction: number) => void) | undefined;
}) {
  const drag = useRef<{ id: number; inverse: DOMMatrix; offset: number }>(null);
  return <GraphChart chart={graph} answer={graph.hidden} accessibleLabel={label} fixedAxis>
    {onMove && (({ left, start, right, top, bottom }) => {
      function move(event: PointerEvent<SVGLineElement>) {
        if (drag.current?.id !== event.pointerId) return;
        const { inverse, offset } = drag.current;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
        onMove?.((point.x - offset - left) / (right - left));
      }
      return <line className="graph-cutoff-handle" data-graph-cutoff="" aria-hidden="true" x1={start} x2={start} y1={top} y2={bottom}
        onPointerDown={event => {
          if (event.button !== 0 || drag.current) return;
          const inverse = event.currentTarget.getScreenCTM()?.inverse();
          if (!inverse) return;
          const offset = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse).x - start;
          drag.current = { id: event.pointerId, inverse, offset };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={move} onPointerUp={event => { move(event); drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }} />;
    })}
  </GraphChart>;
}

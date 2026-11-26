import { useEffect, useRef, useState } from 'react';
import {
  BRICK_BALL_RADIUS, BRICK_CONTROLS, BRICK_HEIGHT, BRICK_HZ, BRICK_MAX_TICKS, BRICK_PADDLE_WIDTH, BRICK_PADDLE_Y, BRICK_WIDTH,
  brickControl, brickElapsed, brickRect, startBrickRun, tickBrickRun, type BrickRun,
} from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { BRICK_TEXTS } from './brick-rally.text.js';
import './brick-rally.css';

function paintField(context: CanvasRenderingContext2D, run: BrickRun) {
  context.fillStyle = '#0d111b';
  context.fillRect(0, 0, BRICK_WIDTH, BRICK_HEIGHT);
  context.fillStyle = '#151d2b';
  context.fillRect(8, 9, BRICK_WIDTH - 16, BRICK_HEIGHT - 18);
  context.strokeStyle = '#354258';
  context.strokeRect(8.5, 9.5, BRICK_WIDTH - 17, BRICK_HEIGHT - 19);
  const colors = ['#83b4b0', '#68aaa3', '#4a938d', '#4c8999', '#646d9a', '#806786'];
  run.tiles.forEach((health, index) => {
    if (!health) return;
    const { x, y, width, height } = brickRect(run, index);
    const row = Math.floor(index / run.columns);
    const gradient = Math.min(colors.length - 1, Math.floor(row * colors.length / run.rows));
    context.fillStyle = health === 2 ? '#d49b85' : colors[gradient]!;
    context.fillRect(x, y, width, height);
    if (health === 2) {
      context.fillStyle = '#563947';
      context.fillRect(x + 2, y + 2, width - 4, 1);
    }
  });
}

function paintPaddle(context: CanvasRenderingContext2D, run: BrickRun) {
  context.fillStyle = '#ff826c';
  context.fillRect(run.paddle - BRICK_PADDLE_WIDTH / 2, BRICK_PADDLE_Y, BRICK_PADDLE_WIDTH, 6);
  context.fillStyle = '#fff7e9';
  context.beginPath();
  context.arc(run.x, run.y, BRICK_BALL_RADIUS - 1, 0, Math.PI * 2);
  context.fill();
}

export function BrickMapPreview({ map, label }: { map: readonly string[]; label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) {
      const run = startBrickRun(map);
      paintField(context, run);
      paintPaddle(context, run);
    }
  }, [map]);
  return <canvas className="brick-board" ref={canvas} width={BRICK_WIDTH} height={BRICK_HEIGHT} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export type BrickResult = { value: number; brickTrace: string };

export function BrickRallyBoard({ map, disabled = false, onClear, raceStart }: { map: readonly string[]; disabled?: boolean; raceStart?: number; onClear?: (result: BrickResult) => void }) {
  const t = useTexts(BRICK_TEXTS);
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef(BRICK_WIDTH / 2);
  const keys = useRef(new Set<string>());
  const pointer = useRef<number | null>(null);
  const latest = useRef({ disabled, onClear });
  latest.current = { disabled, onClear };
  const [remaining, setRemaining] = useState(() => startBrickRun(map).remaining);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<BrickResult>();
  const [expired, setExpired] = useState(false);
  const initialRaceStart = useRef(raceStart);
  const layout = map.join('|');

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    canvas.current?.focus({ preventScroll: true });
    const run = startBrickRun(layout.split('|'));
    const field = document.createElement('canvas');
    field.width = BRICK_WIDTH;
    field.height = BRICK_HEIGHT;
    const fieldContext = field.getContext('2d');
    if (!fieldContext) return;
    let renderedHits = -1;
    const paint = () => {
      if (renderedHits !== run.hits) {
        paintField(fieldContext, run);
        renderedHits = run.hits;
      }
      context.drawImage(field, 0, 0);
      paintPaddle(context, run);
    };
    const trace: string[] = [];
    const start = performance.now() - Math.max(0, initialRaceStart.current === undefined ? 0 : Date.now() - initialRaceStart.current);
    let frame: number;
    let lastSeconds = 0;
    let lastRemaining = run.remaining;
    paint();
    const play = (now: number) => {
      // Use wall time for the tick budget, with bounded catch-up after a slow frame.
      const ticks = Math.min(BRICK_MAX_TICKS, run.ticks + 120, Math.floor((now - start) * BRICK_HZ / 1000));
      while (run.ticks < ticks && run.remaining > 0) {
        if (!latest.current.disabled) {
          const direction = Number(keys.current.has('ArrowRight')) - Number(keys.current.has('ArrowLeft'));
          target.current = Math.max(0, Math.min(BRICK_WIDTH, target.current + direction * 7));
        }
        const control = brickControl(target.current);
        trace.push(BRICK_CONTROLS[control]!);
        tickBrickRun(run, control);
      }
      paint();
      const elapsed = Math.floor(run.ticks / BRICK_HZ);
      if (elapsed !== lastSeconds) { lastSeconds = elapsed; setSeconds(elapsed); }
      if (run.remaining !== lastRemaining) { lastRemaining = run.remaining; setRemaining(run.remaining); }
      if (!run.remaining) {
        const clear = { value: brickElapsed(run.ticks), brickTrace: trace.join('') };
        setResult(clear);
        if (!latest.current.disabled) latest.current.onClear?.(clear);
      } else if (run.ticks === BRICK_MAX_TICKS) setExpired(true);
      else frame = requestAnimationFrame(play);
    };
    frame = requestAnimationFrame(play);
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  const aim = (clientX: number) => {
    const bounds = canvas.current?.getBoundingClientRect();
    if (bounds && !disabled) target.current = (clientX - bounds.left) / bounds.width * BRICK_WIDTH;
  };
  return <div className="brick-rally">
    <div className="brick-hud"><span>{t('remaining', { count: remaining })}</span><span>{seconds} s</span></div>
    <canvas className="brick-board" ref={canvas} width={BRICK_WIDTH} height={BRICK_HEIGHT} tabIndex={0} aria-label={t('board')}
      onPointerDown={event => {
        if (disabled || event.button !== 0 || pointer.current !== null) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        aim(event.clientX);
      }}
      onPointerMove={event => { if (pointer.current === event.pointerId) aim(event.clientX); }}
      onLostPointerCapture={() => { pointer.current = null; }}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault(); keys.current.add(event.key);
      }}
      onKeyUp={event => keys.current.delete(event.key)} onBlur={() => keys.current.clear()} />
    {result ? <div className="brick-status">
      <span role="status">{t('cleared', { time: (result.value / 1000).toFixed(2) })}</span>
      {onClear && <button type="button" disabled={disabled} onClick={() => onClear(result)}>{t('submit')}</button>}
    </div> : <p className="brick-help" role={expired ? 'status' : undefined}>{t(expired ? 'expired' : 'controls')}</p>}
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import {
  BRICK_BALL_RADIUS, BRICK_CONTROLS, BRICK_HEIGHT, BRICK_HZ, BRICK_MAX_TICKS, BRICK_PADDLE_WIDTH, BRICK_PADDLE_Y, BRICK_SPLIT_TILE, BRICK_WIDE_TILE, BRICK_WIDTH,
  brickControl, brickElapsed, brickPaddleWidth, brickRect, startBrickRun, tickBrickRun, type BrickRun,
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
    const power = run.powerTiles[index];
    context.fillStyle = power === BRICK_SPLIT_TILE ? '#c1a2ff' : power === BRICK_WIDE_TILE ? '#ffcf66' : health > 2 ? '#f5ac77' : health === 2 ? '#d49b85' : colors[gradient]!;
    context.fillRect(x, y, width, height);
    if (power === BRICK_SPLIT_TILE || power === BRICK_WIDE_TILE) {
      context.fillStyle = '#20203a';
      context.fillRect(x + width / 2 - 2, y + height / 2 - .5, 4, 1);
      if (power === BRICK_SPLIT_TILE) context.fillRect(x + width / 2 - .5, y + height / 2 - 2, 1, 4);
    } else if (health > 2) {
      context.fillStyle = '#412734';
      context.font = 'bold 7px system-ui';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(health), x + width / 2, y + height / 2 + .5);
    } else if (health === 2) {
      context.fillStyle = '#563947';
      context.fillRect(x + 2, y + 2, width - 4, 1);
    }
  });
}

function paintPaddle(context: CanvasRenderingContext2D, run: BrickRun) {
  const width = brickPaddleWidth(run);
  context.fillStyle = width > BRICK_PADDLE_WIDTH ? '#ffcf66' : '#ff826c';
  context.fillRect(run.paddle - width / 2, BRICK_PADDLE_Y, width, 6);
  context.fillStyle = '#fff7e9';
  for (const ball of run.balls) {
    context.beginPath();
    context.arc(ball.x, ball.y, BRICK_BALL_RADIUS - 1, 0, Math.PI * 2);
    context.fill();
  }
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

export function BrickRallyBoard({ map, lives, timeLimitMs, disabled = false, onClear, raceStart }: {
  map: readonly string[]; lives?: number | undefined; timeLimitMs?: number | undefined; disabled?: boolean; raceStart?: number; onClear?: (result: BrickResult) => void;
}) {
  const t = useTexts(BRICK_TEXTS);
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef(BRICK_WIDTH / 2);
  const keys = useRef(new Set<string>());
  const pointer = useRef<number | null>(null);
  const maxTicks = Math.min(BRICK_MAX_TICKS, Math.max(0, Math.floor((timeLimitMs ?? Infinity) * BRICK_HZ / 1000)));
  const latest = useRef({ disabled, onClear, maxTicks });
  latest.current = { disabled, onClear, maxTicks };
  const [remaining, setRemaining] = useState(() => startBrickRun(map).remaining);
  const [elapsedTicks, setElapsedTicks] = useState(0);
  const [livesLeft, setLivesLeft] = useState(lives);
  const [result, setResult] = useState<BrickResult>();
  const [expired, setExpired] = useState(false);
  const initialRaceStart = useRef(raceStart);
  const layout = map.join('|');

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    canvas.current?.focus({ preventScroll: true });
    const run = startBrickRun(layout.split('|'), lives);
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
    let lastLives = run.livesLeft;
    let timedOut = false;
    paint();
    const play = (now: number) => {
      // Use wall time for the tick budget, with bounded catch-up after a slow frame.
      const ticks = Math.min(latest.current.maxTicks, run.ticks + 120, Math.floor((now - start) * BRICK_HZ / 1000));
      while (run.ticks < ticks && run.remaining > 0 && run.livesLeft !== 0) {
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
      const deadlineReached = run.ticks >= latest.current.maxTicks;
      if (elapsed !== lastSeconds || deadlineReached !== timedOut) { lastSeconds = elapsed; setElapsedTicks(run.ticks); }
      if (run.remaining !== lastRemaining) { lastRemaining = run.remaining; setRemaining(run.remaining); }
      if (run.livesLeft !== lastLives) { lastLives = run.livesLeft; setLivesLeft(run.livesLeft); }
      if (!run.remaining) {
        const clear = { value: brickElapsed(run.ticks), brickTrace: trace.join('') };
        setResult(clear);
        if (!latest.current.disabled) latest.current.onClear?.(clear);
      } else if (run.livesLeft !== 0) {
        if (timedOut !== deadlineReached) { timedOut = deadlineReached; setExpired(timedOut); }
        // The host can extend a live round's deadline.
        if (run.ticks < BRICK_MAX_TICKS) frame = requestAnimationFrame(play);
      }
    };
    frame = requestAnimationFrame(play);
    return () => cancelAnimationFrame(frame);
  }, [layout, lives]);

  const aim = (clientX: number) => {
    const bounds = canvas.current?.getBoundingClientRect();
    if (bounds && !disabled) target.current = (clientX - bounds.left) / bounds.width * BRICK_WIDTH;
  };
  return <div className="brick-rally">
    <div className="brick-hud"><span>{t('remaining', { count: remaining })}</span>
      {livesLeft !== undefined && <span>{t('livesLeft', { count: livesLeft })}</span>}
      <span>{t('timeLeft', { seconds: Math.ceil(Math.max(0, maxTicks - elapsedTicks) / BRICK_HZ) })}</span></div>
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
    </div> : <p className="brick-help" role={expired || livesLeft === 0 ? 'status' : undefined}>{t(livesLeft === 0 ? 'outOfLives' : expired ? 'expired' : 'controls')}</p>}
  </div>;
}

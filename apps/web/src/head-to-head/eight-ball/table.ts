import { BALL_RADIUS, DEFAULT_POOL_START, isLegalPoolContact, POCKET_RADIUS, POOL_HEIGHT, POOL_POCKETS, POOL_WIDTH, poolStartX, type PoolFrame, type PoolTarget, type ResolvedPoolStart } from '@party/contracts';
import { poolAimPath, poolObjectPath } from './aim.js';

const COLORS = ['#faf8f1', '#f6c942', '#477bdd', '#df463d', '#9161cf', '#ff9d45', '#37b879', '#af424c', '#171c23'];
export const poolBallColor = (id: number) => COLORS[id > 8 ? id - 8 : id]!;
export type BallRotation = { phase: number; direction: number };
export const POOL_RAIL = 40;
export const POOL_CANVAS_WIDTH = POOL_WIDTH + POOL_RAIL * 2;
export const POOL_CANVAS_HEIGHT = POOL_HEIGHT + POOL_RAIL * 2;

export function poolPocketCenter(index: number): readonly [number, number] {
  const [x, y] = POOL_POCKETS[index]!;
  const side = x === POOL_WIDTH / 2;
  return [side ? x : x === 0 ? -17 : x + 17, y + (y === 0 ? -1 : 1) * (side ? 20 : 17)];
}

function paintRails(ctx: CanvasRenderingContext2D) {
  const rail = ctx.createLinearGradient(0, -POOL_RAIL, 0, POOL_HEIGHT + POOL_RAIL);
  rail.addColorStop(0, '#885e4d');
  rail.addColorStop(.5, '#4d302b');
  rail.addColorStop(1, '#795344');
  ctx.fillStyle = rail;
  ctx.fillRect(-POOL_RAIL, -POOL_RAIL, POOL_CANVAS_WIDTH, POOL_CANVAS_HEIGHT);
  ctx.strokeStyle = '#b68a70';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(2 - POOL_RAIL, 2 - POOL_RAIL, POOL_CANVAS_WIDTH - 4, POOL_CANVAS_HEIGHT - 4, 12);
  ctx.stroke();

  const cushion = (from: number, to: number) => {
    ctx.beginPath();
    ctx.moveTo(from, -13);
    ctx.lineTo(to, -13);
    ctx.lineTo(to - 9, 0);
    ctx.lineTo(from + 9, 0);
    ctx.closePath();
    ctx.fillStyle = '#104b40';
    ctx.fill();
    ctx.strokeStyle = '#35927a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#dec4a4';
    ctx.beginPath();
    const middle = (from + to) / 2;
    ctx.moveTo(middle, -22);
    ctx.lineTo(middle + 4, -18);
    ctx.lineTo(middle, -14);
    ctx.lineTo(middle - 4, -18);
    ctx.fill();
  };
  for (const [x, y, angle] of [[0, 0, 0], [POOL_WIDTH, POOL_HEIGHT, Math.PI], [0, POOL_HEIGHT, -Math.PI / 2], [POOL_WIDTH, 0, Math.PI / 2]] as const) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (angle === 0 || angle === Math.PI) {
      cushion(14, POOL_WIDTH / 2 - 13);
      cushion(POOL_WIDTH / 2 + 13, POOL_WIDTH - 14);
    } else cushion(14, POOL_HEIGHT - 14);
    ctx.restore();
  }
}

export function paintPool(ctx: CanvasRenderingContext2D, balls: PoolFrame, options: {
  aim?: { angle: number; power: number } | undefined; eightPocket?: number | null; placing?: boolean;
  strike?: { angle: number; power: number; progress: number } | undefined; respottedEight?: boolean;
  rotations?: ReadonlyMap<number, BallRotation>;
  target?: PoolTarget | null; objectGuide?: boolean; start?: ResolvedPoolStart;
  sinking?: ReadonlyMap<number, number> | undefined;
} = {}) {
  const { aim, strike, eightPocket, placing, target, objectGuide, start = DEFAULT_POOL_START } = options;
  ctx.save();
  ctx.translate(POOL_RAIL, POOL_RAIL);
  paintRails(ctx);
  const felt = ctx.createLinearGradient(0, 0, POOL_WIDTH, POOL_HEIGHT);
  felt.addColorStop(0, '#28886c');
  felt.addColorStop(1, '#155745');
  ctx.fillStyle = felt;
  ctx.fillRect(0, 0, POOL_WIDTH, POOL_HEIGHT);
  const startingLine = poolStartX(start);
  if (placing) {
    const left = start.side === 'left';
    ctx.fillStyle = '#d3fff239';
    ctx.fillRect(left ? 0 : startingLine, 0, left ? startingLine : POOL_WIDTH - startingLine, POOL_HEIGHT);
  }
  ctx.strokeStyle = placing ? '#eee5b3' : '#b8dbcd90';
  ctx.lineWidth = placing ? 2.5 : 1.7;
  ctx.setLineDash([8, 7]);
  ctx.beginPath();
  ctx.moveTo(startingLine, 7);
  ctx.lineTo(startingLine, POOL_HEIGHT - 7);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [index, [mouthX, mouthY]] of POOL_POCKETS.entries()) {
    const [x, y] = poolPocketCenter(index);
    const side = mouthX === POOL_WIDTH / 2;
    const radius = side ? POCKET_RADIUS - 4 : POCKET_RADIUS - 1;
    if (side) {
      const direction = mouthY === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(x - 12, mouthY);
      ctx.lineTo(x + 12, mouthY);
      ctx.lineTo(x + 17, mouthY + direction * 13);
      ctx.lineTo(x - 17, mouthY + direction * 13);
      ctx.closePath();
      ctx.fillStyle = '#183c34';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const pocket = ctx.createRadialGradient(x, y, 2, x, y, radius);
    pocket.addColorStop(.55, '#070b0b');
    pocket.addColorStop(1, '#22302b');
    ctx.fillStyle = pocket;
    ctx.fill();
    ctx.strokeStyle = index === eightPocket ? '#ffda72' : '#382925';
    ctx.lineWidth = index === eightPocket ? 4 : 2;
    ctx.stroke();
  }

  const cue = balls.find(([id]) => id === 0);
  if (aim && cue) {
    const angle = aim.angle * Math.PI / 180;
    const [, x, y] = cue;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const { distance, hit } = poolAimPath(cue, dx, dy, balls);
    const contactX = x + dx * distance;
    const contactY = y + dy * distance;
    const legal = !hit || !target || isLegalPoolContact(target, hit[0]);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + dx * Math.min(11, distance), y + dy * Math.min(11, distance));
    ctx.lineTo(contactX, contactY);
    if (hit) {
      const path = objectGuide ? poolObjectPath(hit, contactX, contactY, balls) : null;
      if (path) {
        const [, bx, by] = hit;
        if (path.distance > BALL_RADIUS + 2) {
          ctx.moveTo(bx + path.dx * BALL_RADIUS, by + path.dy * BALL_RADIUS);
          ctx.lineTo(bx + path.dx * path.distance, by + path.dy * path.distance);
        }
        // The short cue-ball guide shows the tangent for a cut without spin.
        const cut = dx * -path.dy + dy * path.dx;
        if (Math.abs(cut) > .12) {
          const tx = -path.dy * Math.sign(cut), ty = path.dx * Math.sign(cut);
          const length = Math.min(12 + 48 * Math.abs(cut), poolAimPath([0, contactX, contactY], tx, ty, balls).distance);
          if (length > BALL_RADIUS) {
            ctx.moveTo(contactX + tx * BALL_RADIUS, contactY + ty * BALL_RADIUS);
            ctx.lineTo(contactX + tx * length, contactY + ty * length);
          }
        }
      }
      ctx.moveTo(contactX + BALL_RADIUS, contactY);
      ctx.arc(contactX, contactY, BALL_RADIUS, 0, Math.PI * 2);
    }
    ctx.strokeStyle = '#122725';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = legal ? '#fff7dd' : '#ff9d91';
    ctx.lineWidth = 2.3;
    ctx.stroke();
    ctx.restore();
  }
  const cueAction = strike ?? aim;
  if (cueAction && cue) {
    const radians = cueAction.angle * Math.PI / 180;
    const dx = Math.cos(radians), dy = Math.sin(radians);
    const [, x, y] = cue;
    const gap = 17 + cueAction.power * .6 - BALL_RADIUS;
    const pull = BALL_RADIUS + gap * (1 - (strike?.progress ?? 0)) ** 2;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e8ba83';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - dx * pull, y - dy * pull);
    ctx.lineTo(x - dx * (pull + 145), y - dy * (pull + 145));
    ctx.stroke();
    ctx.restore();
  }
  if (target || options.respottedEight) {
    for (const [id, x, y] of balls) {
      if (!(options.respottedEight && id === 8) && (!target || target === 'break' || target === 'open' || !isLegalPoolContact(target, id))) continue;
      ctx.beginPath();
      ctx.arc(x, y, BALL_RADIUS + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#182d29';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#ffdc7e';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
  }
  for (const [id, x, y] of balls) {
    const color = poolBallColor(id);
    ctx.save();
    const scale = options.sinking?.get(id);
    if (scale !== undefined) {
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.translate(-x, -y);
      ctx.globalAlpha = scale;
    }
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    const shell = ctx.createRadialGradient(x - 3, y - 3.5, 0, x, y, BALL_RADIUS + 2);
    shell.addColorStop(0, id === 8 ? '#505361' : '#fffdf4');
    shell.addColorStop(.28, id > 8 ? '#fffdf4' : color);
    shell.addColorStop(.86, id > 8 ? '#efede4' : color);
    shell.addColorStop(1, '#112624');
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.clip();
    const spin = options.rotations?.get(id);
    const phase = spin?.phase ?? 0;
    const depth = Math.cos(phase);
    ctx.translate(x, y);
    if (id > 8) {
      // Keep the colored belt visible even when the rendered ball is turning edge-on.
      ctx.save();
      ctx.rotate((spin?.direction ?? 0) + Math.sin(phase) * .85);
      const halfBand = 4 + Math.abs(depth);
      const offset = Math.sin(phase) * 2.5;
      ctx.fillStyle = color;
      ctx.fillRect(-BALL_RADIUS, offset - halfBand, BALL_RADIUS * 2, halfBand * 2);
      ctx.restore();
    }
    if (id !== 0) {
      ctx.translate(Math.sin(phase) * 2.5, Math.sin(phase * 2) * 1.2);
      ctx.fillStyle = '#fffdf4';
      ctx.beginPath();
      ctx.arc(0, 0, 5.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#171c23';
      ctx.font = `900 ${id > 9 ? 7.8 : 8.5}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(id), 0, .2);
    } else if (spin && depth > 0) {
      ctx.rotate(spin.direction);
      ctx.fillStyle = '#c53b3b';
      ctx.beginPath();
      ctx.ellipse(Math.sin(phase) * 7, 0, 1.8 * depth, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

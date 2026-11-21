import { BALL_RADIUS, DEFAULT_POOL_START, isLegalPoolContact, POCKET_RADIUS, POOL_HEIGHT, POOL_POCKETS, POOL_WIDTH, poolStartX, type PoolFrame, type PoolTarget, type ResolvedPoolStart } from '@party/contracts';
import { poolAimPath, poolObjectPath } from './aim.js';

const COLORS = ['#faf8f1', '#f6c942', '#477bdd', '#df463d', '#9161cf', '#ff9d45', '#37b879', '#af424c', '#171c23'];
export const poolBallColor = (id: number) => COLORS[id > 8 ? id - 8 : id]!;
export type BallRotation = { phase: number; direction: number };

export function paintPool(ctx: CanvasRenderingContext2D, balls: PoolFrame, options: {
  aim?: { angle: number; power: number } | undefined; eightPocket?: number | null; placing?: boolean;
  rotations?: ReadonlyMap<number, BallRotation>;
  target?: PoolTarget | null; objectGuide?: boolean; start?: ResolvedPoolStart;
  sinking?: ReadonlyMap<number, number> | undefined;
} = {}) {
  const { aim, eightPocket, placing, target, objectGuide, start = DEFAULT_POOL_START } = options;
  const felt = ctx.createLinearGradient(0, 0, POOL_WIDTH, POOL_HEIGHT);
  felt.addColorStop(0, '#28886c');
  felt.addColorStop(1, '#155745');
  ctx.fillStyle = felt;
  ctx.fillRect(0, 0, POOL_WIDTH, POOL_HEIGHT);
  ctx.strokeStyle = '#104b3e';
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, POOL_WIDTH - 5, POOL_HEIGHT - 5);
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
  for (const [index, [px, py]] of POOL_POCKETS.entries()) {
    // Move the visible pocket rim slightly inside the rail so the corner openings read clearly.
    const x = Math.max(6, Math.min(POOL_WIDTH - 6, px));
    const y = Math.max(5, Math.min(POOL_HEIGHT - 5, py));
    ctx.beginPath();
    ctx.arc(x, y, POCKET_RADIUS + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#101b1c';
    ctx.fill();
    ctx.strokeStyle = index === eightPocket ? '#ffda72' : '#ad8867';
    ctx.lineWidth = index === eightPocket ? 5 : 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, POCKET_RADIUS - 5, 0, Math.PI * 2);
    const pocket = ctx.createRadialGradient(x, y, 1, x, y, POCKET_RADIUS - 4);
    pocket.addColorStop(0, '#020506');
    pocket.addColorStop(1, '#141f1e');
    ctx.fillStyle = pocket;
    ctx.fill();
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
    ctx.strokeStyle = '#f8f5db';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(x + dx * Math.min(11, distance), y + dy * Math.min(11, distance));
    ctx.lineTo(contactX, contactY);
    ctx.stroke();
    ctx.setLineDash([]);
    if (hit) {
      const legal = !target || isLegalPoolContact(target, hit[0]);
      ctx.strokeStyle = legal ? '#f8f5db' : '#ff9d91';
      ctx.beginPath();
      ctx.arc(contactX, contactY, BALL_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      const path = objectGuide ? poolObjectPath(hit, contactX, contactY, balls) : null;
      if (path && path.distance > BALL_RADIUS + 2) {
        const [, bx, by] = hit;
        ctx.strokeStyle = legal ? '#9ef6e1' : '#ff9d91';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 5]);
        ctx.beginPath();
        ctx.moveTo(bx + path.dx * (BALL_RADIUS + 2), by + path.dy * (BALL_RADIUS + 2));
        ctx.lineTo(bx + path.dx * path.distance, by + path.dy * path.distance);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const pull = 17 + aim.power * .6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e8ba83';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - dx * pull, y - dy * pull);
    ctx.lineTo(x - dx * (pull + 145), y - dy * (pull + 145));
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  if (target && target !== 'break' && target !== 'open') {
    for (const [id, x, y] of balls) {
      if (!isLegalPoolContact(target, id)) continue;
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
}

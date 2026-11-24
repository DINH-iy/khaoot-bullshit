import { BALL_RADIUS, DEFAULT_POOL_FELT, inPoolMouth, DEFAULT_POOL_START, isLegalPoolContact, POOL_HEIGHT, POOL_POCKETS, POOL_WIDTH, poolStartX, type PoolFelt, type PoolFrame, type PoolTarget, type ResolvedPoolStart } from '@party/contracts';
import { POOL_CUE_LENGTH, poolAimPath, poolCueOffset, poolObjectPath } from './aim.js';

const COLORS = ['#faf8f1', '#f6c942', '#477bdd', '#df463d', '#9161cf', '#ff9d45', '#37b879', '#af424c', '#171c23'];
export const poolBallColor = (id: number) => COLORS[id > 8 ? id - 8 : id]!;
export type BallRotation = { phase: number; direction: number };
export const POOL_RAIL = 40;
export const POOL_CANVAS_WIDTH = POOL_WIDTH + POOL_RAIL * 2;
export const POOL_CANVAS_HEIGHT = POOL_HEIGHT + POOL_RAIL * 2;
/** How far the rubber cushions reach from the playing edge into the rail. */
const CUSHION = 14;
const CORNER_HOLE = 20;
const SIDE_HOLE = 16;

/** Cloth shades per felt: centre glow, main cloth, vignette edge, and the cushion rubber. */
export const POOL_FELT_COLORS: Record<PoolFelt, { light: string; base: string; edge: string; cushion: string }> = {
  green: { light: '#3aa874', base: '#268a5c', edge: '#155a3a', cushion: '#1b6c47' },
  blue: { light: '#3f8fd6', base: '#2a71b5', edge: '#174777', cushion: '#1d5a93' },
  teal: { light: '#33a6a4', base: '#218887', edge: '#115857', cushion: '#176b6a' },
  red: { light: '#c44b48', base: '#a33634', edge: '#661c1c', cushion: '#822827' },
  purple: { light: '#8a64c6', base: '#6c49a8', edge: '#402a6c', cushion: '#553889' },
  gray: { light: '#77818c', base: '#5c6670', edge: '#353c44', cushion: '#47505a' },
};

/** The middle of a pocket's hole, which sits in the rail behind the cushion jaws. */
export function poolPocketCenter(index: number): readonly [number, number] {
  const [x, y] = POOL_POCKETS[index]!;
  const side = x === POOL_WIDTH / 2;
  const out = y === 0 ? -1 : 1;
  return side ? [x, y + out * 18] : [x + (x === 0 ? -10 : 10), y + out * 10];
}

function paintTable(ctx: CanvasRenderingContext2D, felt: PoolFelt, eightPocket: number | null | undefined) {
  const cloth = POOL_FELT_COLORS[felt];
  // Wooden frame with a soft top sheen and a dark outer edge.
  const wood = ctx.createLinearGradient(0, -POOL_RAIL, 0, POOL_HEIGHT + POOL_RAIL);
  wood.addColorStop(0, '#7a4a2c');
  wood.addColorStop(.08, '#5c3520');
  wood.addColorStop(.5, '#4a2918');
  wood.addColorStop(.92, '#5c3520');
  wood.addColorStop(1, '#3a1f12');
  ctx.beginPath();
  ctx.roundRect(-POOL_RAIL, -POOL_RAIL, POOL_CANVAS_WIDTH, POOL_CANVAS_HEIGHT, 30);
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#21120a';
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(3 - POOL_RAIL, 3 - POOL_RAIL, POOL_CANVAS_WIDTH - 6, POOL_CANVAS_HEIGHT - 6, 27);
  ctx.strokeStyle = '#c08a5e66';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Leather pocket cups sit in the rail; the cloth and cushions are laid over their inner half.
  for (const index of POOL_POCKETS.keys()) {
    const [x, y] = poolPocketCenter(index);
    const radius = (POOL_POCKETS[index]![0] === POOL_WIDTH / 2 ? SIDE_HOLE : CORNER_HOLE) + 6;
    const cup = ctx.createRadialGradient(x, y - 4, 2, x, y, radius);
    cup.addColorStop(0, '#2c1f19');
    cup.addColorStop(.75, '#1a120e');
    cup.addColorStop(1, '#0d0907');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = cup;
    ctx.fill();
  }

  // Bed of cloth, brighter in the middle like a lamp above the table.
  const bed = ctx.createRadialGradient(POOL_WIDTH / 2, POOL_HEIGHT / 2, 30, POOL_WIDTH / 2, POOL_HEIGHT / 2, POOL_WIDTH * .62);
  bed.addColorStop(0, cloth.light);
  bed.addColorStop(.55, cloth.base);
  bed.addColorStop(1, cloth.edge);
  ctx.fillStyle = bed;
  ctx.fillRect(0, 0, POOL_WIDTH, POOL_HEIGHT);

  // Each pocket mouth: cloth between the jaws that darkens into the hole.
  for (const [index, [mouthX, mouthY]] of POOL_POCKETS.entries()) {
    const side = mouthX === POOL_WIDTH / 2;
    const [x, y] = poolPocketCenter(index);
    const radius = side ? SIDE_HOLE : CORNER_HOLE;
    ctx.save();
    ctx.translate(mouthX, mouthY);
    ctx.scale(mouthX === POOL_WIDTH ? -1 : 1, mouthY === 0 ? 1 : -1);
    ctx.beginPath();
    if (side) {
      ctx.moveTo(-23, 0); ctx.lineTo(-19, -CUSHION); ctx.lineTo(19, -CUSHION); ctx.lineTo(23, 0);
    } else {
      ctx.moveTo(27, 0); ctx.lineTo(15, -CUSHION); ctx.lineTo(-CUSHION, -CUSHION); ctx.lineTo(-CUSHION, 15); ctx.lineTo(0, 27);
    }
    ctx.closePath();
    ctx.restore();
    const throat = ctx.createRadialGradient(x, y, radius * .8, x, y, radius + (side ? 14 : 20));
    throat.addColorStop(0, '#050505');
    throat.addColorStop(.45, cloth.edge);
    throat.addColorStop(1, cloth.base);
    ctx.fillStyle = throat;
    ctx.fill();
  }

  // Cushions: the nose lines up with the edge the physics bounces off, the jaws narrow towards each pocket.
  const cushion = (noseFrom: number, noseTo: number, backFrom: number, backTo: number) => {
    const rubber = ctx.createLinearGradient(0, -CUSHION, 0, 0);
    rubber.addColorStop(0, cloth.edge);
    rubber.addColorStop(.7, cloth.cushion);
    rubber.addColorStop(1, cloth.base);
    ctx.beginPath();
    ctx.moveTo(backFrom, -CUSHION);
    ctx.lineTo(backTo, -CUSHION);
    ctx.lineTo(noseTo, 0);
    ctx.lineTo(noseFrom, 0);
    ctx.closePath();
    ctx.fillStyle = rubber;
    ctx.fill();
    ctx.strokeStyle = '#ffffff2e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(noseFrom, -.6);
    ctx.lineTo(noseTo, -.6);
    ctx.stroke();
    // Shadow the cushion casts onto the cloth.
    const shade = ctx.createLinearGradient(0, 0, 0, 6);
    shade.addColorStop(0, '#0000004d');
    shade.addColorStop(1, '#0000');
    ctx.fillStyle = shade;
    ctx.fillRect(noseFrom, 0, noseTo - noseFrom, 6);
  };
  const sight = (at: number) => {
    const mid = -CUSHION - (POOL_RAIL - CUSHION) / 2;
    ctx.beginPath();
    ctx.moveTo(at, mid - 4);
    ctx.lineTo(at + 3, mid);
    ctx.lineTo(at, mid + 4);
    ctx.lineTo(at - 3, mid);
    ctx.closePath();
    ctx.fillStyle = '#f1e4c6';
    ctx.fill();
  };
  const half = POOL_WIDTH / 2;
  for (const [x, y, angle] of [[0, 0, 0], [POOL_WIDTH, POOL_HEIGHT, Math.PI], [0, POOL_HEIGHT, -Math.PI / 2], [POOL_WIDTH, 0, Math.PI / 2]] as const) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const long = angle === 0 || angle === Math.PI;
    const length = long ? POOL_WIDTH : POOL_HEIGHT;
    if (long) {
      cushion(27, half - 23, 15, half - 19);
      cushion(half + 23, length - 27, half + 19, length - 15);
    } else cushion(27, length - 27, 15, length - 15);
    const sights = long ? 8 : 4;
    for (let step = 1; step < sights; step++) if (!long || step !== 4) sight(length * step / sights);
    ctx.restore();
  }

  // The holes, with a darker throat at the far side so they read as depth.
  for (const index of POOL_POCKETS.keys()) {
    const [x, y] = poolPocketCenter(index);
    const radius = POOL_POCKETS[index]![0] === POOL_WIDTH / 2 ? SIDE_HOLE : CORNER_HOLE;
    const inward = POOL_POCKETS[index]![1] === 0 ? 1 : -1;
    const hole = ctx.createRadialGradient(x, y - inward * 5, 1, x, y, radius);
    hole.addColorStop(0, '#000');
    hole.addColorStop(.7, '#050505');
    hole.addColorStop(1, '#1c1714');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = hole;
    ctx.fill();
    if (index === eightPocket) {
      ctx.strokeStyle = '#ffda72';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
}

export function paintPool(ctx: CanvasRenderingContext2D, balls: PoolFrame, options: {
  aim?: { angle: number; power: number; pull?: number | undefined } | undefined; eightPocket?: number | null; placing?: boolean;
  strike?: { angle: number; power: number; progress: number; pull?: number | undefined } | undefined; respottedEight?: boolean;
  rotations?: ReadonlyMap<number, BallRotation>;
  target?: PoolTarget | null; objectGuide?: boolean; start?: ResolvedPoolStart;
  sinking?: ReadonlyMap<number, number> | undefined; felt?: PoolFelt | undefined;
} = {}) {
  const { aim, strike, eightPocket, placing, target, objectGuide, start = DEFAULT_POOL_START } = options;
  ctx.save();
  ctx.translate(POOL_RAIL, POOL_RAIL);
  paintTable(ctx, options.felt ?? DEFAULT_POOL_FELT, eightPocket);
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
    } else {
      // Into a cushion: a short line shows where the cue ball comes off it.
      const wallX = contactX <= BALL_RADIUS + .5 || contactX >= POOL_WIDTH - BALL_RADIUS - .5;
      const wallY = contactY <= BALL_RADIUS + .5 || contactY >= POOL_HEIGHT - BALL_RADIUS - .5;
      const rx = wallX ? -dx : dx, ry = wallY ? -dy : dy;
      const length = Math.min(70, poolAimPath([0, contactX, contactY], rx, ry, balls).distance);
      const opening = wallX ? inPoolMouth(contactY, POOL_HEIGHT, false) : inPoolMouth(contactX, POOL_WIDTH, true);
      if (length > 4 && !opening) {
        ctx.moveTo(contactX, contactY);
        ctx.lineTo(contactX + rx * length, contactY + ry * length);
      }
    }
    ctx.strokeStyle = '#122725';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = legal ? '#fff7dd' : '#ff9d91';
    ctx.lineWidth = 2.3;
    ctx.stroke();
    if (hit) {
      // Ghost cue ball where the cue ball will touch the object ball.
      ctx.beginPath();
      ctx.arc(contactX, contactY, BALL_RADIUS - 1, 0, Math.PI * 2);
      ctx.fillStyle = legal ? '#ffffff40' : '#ff9d9140';
      ctx.fill();
    }
    ctx.restore();
  }
  const cueAction = strike ?? aim;
  if (cueAction && cue) {
    const radians = cueAction.angle * Math.PI / 180;
    const dx = Math.cos(radians), dy = Math.sin(radians);
    const [, x, y] = cue;
    const gap = (cueAction.pull ?? poolCueOffset(cueAction.power)) - BALL_RADIUS;
    const pull = BALL_RADIUS + gap * (1 - (strike?.progress ?? 0)) ** 2;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#e8ba83';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x - dx * pull, y - dy * pull);
    ctx.lineTo(x - dx * (pull + POOL_CUE_LENGTH), y - dy * (pull + POOL_CUE_LENGTH));
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

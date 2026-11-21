import { BALL_RADIUS, POCKET_RADIUS, POOL_HEIGHT, POOL_POCKETS, POOL_START_LINE, POOL_WIDTH, type PoolFrame } from '@party/contracts';

const COLORS = ['#faf8f1', '#f6c942', '#477bdd', '#df463d', '#9161cf', '#ff9d45', '#37b879', '#af424c', '#171c23'];
export function paintPool(ctx: CanvasRenderingContext2D, balls: PoolFrame, options: {
  aim?: { angle: number; power: number } | undefined; eightPocket?: number | null; placing?: boolean;
} = {}) {
  const { aim, eightPocket, placing } = options;
  const felt = ctx.createLinearGradient(0, 0, POOL_WIDTH, POOL_HEIGHT);
  felt.addColorStop(0, '#28886c');
  felt.addColorStop(1, '#155745');
  ctx.fillStyle = felt;
  ctx.fillRect(0, 0, POOL_WIDTH, POOL_HEIGHT);
  ctx.strokeStyle = '#104b3e';
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, POOL_WIDTH - 5, POOL_HEIGHT - 5);
  if (placing) {
    ctx.fillStyle = '#d3fff239';
    ctx.fillRect(0, 0, POOL_START_LINE, POOL_HEIGHT);
    ctx.strokeStyle = '#ddddbb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(POOL_START_LINE, 0);
    ctx.lineTo(POOL_START_LINE, POOL_HEIGHT);
    ctx.stroke();
  }
  for (const [index, [x, y]] of POOL_POCKETS.entries()) {
    ctx.fillStyle = '#111f23';
    ctx.beginPath();
    ctx.arc(x, y, POCKET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    if (index === eightPocket) {
      ctx.strokeStyle = '#ffe082';
      ctx.lineWidth = 5;
      ctx.stroke();
    }
  }
  const cue = balls.find(([id]) => id === 0);
  if (aim && cue) {
    const angle = aim.angle * Math.PI / 180;
    const [, x, y] = cue;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let distance = Math.min((dx >= 0 ? POOL_WIDTH - BALL_RADIUS - x : x - BALL_RADIUS) / Math.abs(dx),
      (dy >= 0 ? POOL_HEIGHT - BALL_RADIUS - y : y - BALL_RADIUS) / Math.abs(dy), 235);
    let contact = false;
    for (const [id, bx, by] of balls) {
      if (!id) continue;
      const along = (bx - x) * dx + (by - y) * dy;
      const cross = (bx - x) * dy - (by - y) * dx;
      const half = BALL_RADIUS * 2;
      if (along <= 0 || Math.abs(cross) >= half) continue;
      const entry = Math.max(0, along - Math.sqrt(half ** 2 - cross ** 2));
      if (entry <= distance) { distance = entry; contact = true; }
    }
    ctx.strokeStyle = '#f8f5db';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(x + dx * 11, y + dy * 11);
    ctx.lineTo(x + dx * distance, y + dy * distance);
    ctx.stroke();
    ctx.setLineDash([]);
    if (contact) {
      ctx.beginPath();
      ctx.arc(x + dx * distance, y + dy * distance, BALL_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
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
  for (const [id, x, y] of balls) {
    const color = COLORS[id > 8 ? id - 8 : id]!;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
    const shell = ctx.createRadialGradient(x - 3, y - 4, 1, x, y, BALL_RADIUS);
    shell.addColorStop(0, id === 8 ? '#4a4e56' : '#fffdf4');
    shell.addColorStop(.32, id > 8 ? COLORS[0]! : color);
    shell.addColorStop(.84, id > 8 ? '#e2dfd2' : color);
    shell.addColorStop(1, '#162927');
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.clip();
    if (id > 8) {
      ctx.fillStyle = color;
      ctx.fillRect(x - BALL_RADIUS, y - 4.5, BALL_RADIUS * 2, 9);
    }
    if (id !== 0) {
      ctx.fillStyle = '#faf8f1';
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#171c23';
      ctx.font = 'bold 8px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(id), x, y);
    }
    ctx.restore();
  }
}

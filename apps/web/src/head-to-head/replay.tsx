import { useEffect, useRef, useState } from 'react';
import type { HeadToHeadReplay } from '@party/contracts';
import { paintPool, POOL_CANVAS_HEIGHT, POOL_CANVAS_WIDTH } from './eight-ball/table.js';
import { CREATURE_NAMES } from './creature-board.js';
import { h } from './h2h.text.js';
import { PIECES, RPS_ICONS, squaresOf } from './pieces.js';

// A finished game, played back move by move on a canvas, which can be saved as a
// video on the phone. The replay only exists as long as the room: nothing is
// stored anywhere else unless the player saves the video themselves.
const SIZE = 320; const FRAME_MS = 900;
const frameCount = (replay: HeadToHeadReplay) => replay.game === 'rps' ? replay.rounds.length + 1 : replay.game === 'tictactoe' ? replay.moves.length + 1 : replay.frames.length;

function draw(ctx: CanvasRenderingContext2D, replay: HeadToHeadReplay, index: number, names: [string, string], result: string) {
  ctx.fillStyle = '#1d1a2b'; ctx.fillRect(0, 0, SIZE, SIZE + 40);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const last = index === frameCount(replay) - 1;
  ctx.font = '600 15px system-ui, sans-serif'; ctx.fillText(last ? result : h('versus', { first: names[0], second: names[1] }), SIZE / 2, SIZE + 20);
  if (replay.game === 'eight-ball') {
    ctx.save();
    const scale = SIZE / POOL_CANVAS_WIDTH;
    ctx.translate(0, (SIZE - POOL_CANVAS_HEIGHT * scale) / 2);
    ctx.scale(scale, scale);
    paintPool(ctx, replay.frames[index]!, { felt: replay.felt });
    ctx.restore();
    return;
  }
  if (replay.game === 'rps') {
    const rounds = replay.rounds.slice(0, index); const round = rounds.at(-1);
    const wins = [0, 1].map(seat => rounds.filter(entry => entry.winner === seat).length);
    ctx.font = '700 22px system-ui, sans-serif'; ctx.fillText(`${names[0]} ${wins[0]} – ${wins[1]} ${names[1]}`, SIZE / 2, 40);
    if (round) { ctx.font = '96px system-ui, sans-serif'; ctx.fillText(RPS_ICONS[round.picks[0]], SIZE / 4, SIZE / 2); ctx.fillText(RPS_ICONS[round.picks[1]], SIZE * 3 / 4, SIZE / 2);
      ctx.font = '600 16px system-ui, sans-serif'; ctx.fillText(round.winner === null ? h('tie') : h('winsRound', { name: names[round.winner] }), SIZE / 2, SIZE - 40); }
    return;
  }
  if (replay.game === 'tictactoe') {
    const cell = SIZE / 3; ctx.strokeStyle = '#8f86c9'; ctx.lineWidth = 4;
    for (const line of [1, 2]) { ctx.beginPath(); ctx.moveTo(line * cell, 10); ctx.lineTo(line * cell, SIZE - 10); ctx.moveTo(10, line * cell); ctx.lineTo(SIZE - 10, line * cell); ctx.stroke(); }
    ctx.font = '700 72px system-ui, sans-serif';
    replay.moves.slice(0, index).forEach((square, move) => { ctx.fillStyle = move % 2 === 0 ? '#ffcf4a' : '#9ad8ff'; ctx.fillText(move % 2 === 0 ? '✕' : '◯', (square % 3 + 0.5) * cell, (Math.floor(square / 3) + 0.5) * cell); });
    return;
  }
  if (replay.game === 'creature-duel') {
    const frame = replay.frames[index]!;
    frame.teams.forEach((team, seat) => {
      const y = 40 + seat * 145;
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText(names[seat as 0 | 1], SIZE / 2, y, SIZE - 20);
      ctx.font = '600 15px system-ui, sans-serif';
      team.forEach((creature, at) => {
        const mark = at === frame.active[seat as 0 | 1] ? '● ' : '';
        ctx.fillText(`${mark}${CREATURE_NAMES[creature.kind]} · ${creature.hp} HP`, SIZE / 2, y + 30 + at * 25, SIZE - 20);
      });
    });
    return;
  }
  const frame = replay.frames[index]!; const cell = SIZE / 8;
  ctx.font = `${cell * 0.8}px "Segoe UI Symbol", "Noto Sans Symbols 2", serif`;
  squaresOf(frame.fen).forEach(({ square, piece }, at) => {
    const x = (at % 8) * cell; const y = Math.floor(at / 8) * cell;
    ctx.fillStyle = square === frame.from || square === frame.to ? '#e6c95a' : (Math.floor(at / 8) + at) % 2 === 0 ? '#e9e3f7' : '#6f5bb0'; ctx.fillRect(x, y, cell, cell);
    // Filled pieces for both sides: the edge first, then the fill on top, like the board.
    if (piece) { const white = piece === piece.toUpperCase(); ctx.fillStyle = white ? '#fff' : '#1b1830'; ctx.strokeStyle = white ? '#1b1830' : '#f4f1ff'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.strokeText(`${PIECES[piece]}︎`, x + cell / 2, y + cell / 2 + 2); ctx.fillText(`${PIECES[piece]}︎`, x + cell / 2, y + cell / 2 + 2); }
  });
}

/** The first video format this browser can record, or null (then there is no save button). */
const videoType = () => typeof MediaRecorder === 'undefined' ? null : ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)) ?? null;

export function Replay({ replay, names, result }: { replay: HeadToHeadReplay; names: [string, string]; result: string }) {
  const canvas = useRef<HTMLCanvasElement>(null); const total = frameCount(replay);
  const [index, setIndex] = useState(total - 1); const [playing, setPlaying] = useState(false); const [saving, setSaving] = useState(''); const type = videoType();
  useEffect(() => { const ctx = canvas.current?.getContext('2d'); if (ctx) draw(ctx, replay, index, names, result); }, [replay, index, names, result]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setIndex(current => { if (current >= total - 1) { setPlaying(false); return current; } return current + 1; }), FRAME_MS);
    return () => clearInterval(timer);
  }, [playing, total]);
  const play = () => { setIndex(0); setPlaying(true); };
  // Records one playback of the canvas, then hands the video to the phone: the share sheet (to keep it in the photos) or a download.
  const save = () => {
    const element = canvas.current; if (!element || !type) return;
    setSaving(h('recording')); const chunks: Blob[] = [];
    const recorder = new MediaRecorder(element.captureStream(30), { mimeType: type });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      const file = new File(chunks, `party-${replay.game}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`, { type: type.split(';')[0] ?? type });
      const share = navigator.canShare?.({ files: [file] }) ? navigator.share({ files: [file], title: result }).catch(() => undefined) : null;
      if (!share) { const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
      setSaving(h('saved'));
    };
    setIndex(0); setPlaying(true); recorder.start();
    setTimeout(() => { recorder.stop(); }, total * FRAME_MS + 600);
  };
  return <div className="h2h-replay">
    <canvas ref={canvas} width={SIZE} height={SIZE + 40} role="img" aria-label={h('replayLabel', { move: index + 1, total, result })} />
    <div className="actions">
      <button type="button" className="small-button" disabled={playing} onClick={play}>▶ {h('replay')}</button>
      {type && <button type="button" className="small-button" disabled={playing} onClick={save}>{h('saveVideo')}</button>}
    </div>
    {saving && <p className="hint" role="status">{saving}</p>}
    <p className="hint">{h('replayGone')}</p>
  </div>;
}

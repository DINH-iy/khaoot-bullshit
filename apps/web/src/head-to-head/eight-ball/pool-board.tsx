import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { canPlacePoolCue, POOL_HEIGHT, POOL_WIDTH, type HeadToHeadMove, type HeadToHeadView, type PoolFrame } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { usePoolLandscape } from './landscape.js';
import { paintPool } from './table.js';
import './pool.css';

const TEXTS = defineTexts('eight-ball', {
  rotate: 'Landscape mode', exitLandscape: 'Exit landscape', guide: 'Drag to aim. Pull back from the cue ball to shoot.',
  requiredPocket: '8 ball · {pocket}', topLeft: 'Top left', topMiddle: 'Top middle', topRight: 'Top right',
  bottomLeft: 'Bottom left', bottomMiddle: 'Bottom middle', bottomRight: 'Bottom right',
  early: '8 ball sunk early', scratch: 'Scratch on the 8', 'wrong-pocket': '8 ball sunk in the wrong pocket', foulEight: 'Foul on the 8',
  table: 'Pool table', aim: 'Aim', power: 'Power', shoot: 'Shoot', placeCue: 'Place cue ball', aimCue: 'Aim cue',
  solids: 'Solids', stripes: 'Stripes', open: 'Open table', foul: 'Foul · Ball in hand',
  remaining: '{group} · {count} left', ballInHand: 'Ball in hand', lower: 'Aim left', higher: 'Aim right',
}, {
  nl: { early: '8-bal te vroeg gepot', scratch: 'Witte bal gepot bij de 8-bal', 'wrong-pocket': '8-bal in de verkeerde pocket', foulEight: 'Fout bij de 8-bal', rotate: 'Liggende stand', exitLandscape: 'Liggende stand verlaten', guide: 'Sleep om te richten. Trek vanaf de witte bal terug om te stoten.', requiredPocket: '8-bal · {pocket}', topLeft: 'Linksboven', topMiddle: 'Middenboven', topRight: 'Rechtsboven', bottomLeft: 'Linksonder', bottomMiddle: 'Middenonder', bottomRight: 'Rechtsonder', table: 'Pooltafel', aim: 'Richting', power: 'Kracht', shoot: 'Stoot', placeCue: 'Witte bal plaatsen', aimCue: 'Richten', solids: 'Hele', stripes: 'Halve', open: 'Open tafel', foul: 'Fout · Bal in de hand', remaining: '{group} · nog {count}', ballInHand: 'Bal in de hand', lower: 'Richt links', higher: 'Richt rechts' },
  de: { early: 'Acht zu früh versenkt', scratch: 'Spielball mit der Acht versenkt', 'wrong-pocket': 'Acht in der falschen Tasche', foulEight: 'Foul bei der Acht', rotate: 'Querformat', exitLandscape: 'Querformat verlassen', guide: 'Zum Zielen ziehen. Zum Stoßen vom Spielball zurückziehen.', requiredPocket: 'Acht · {pocket}', topLeft: 'Oben links', topMiddle: 'Oben Mitte', topRight: 'Oben rechts', bottomLeft: 'Unten links', bottomMiddle: 'Unten Mitte', bottomRight: 'Unten rechts', table: 'Billardtisch', aim: 'Winkel', power: 'Stärke', shoot: 'Stoßen', placeCue: 'Spielball platzieren', aimCue: 'Zielen', solids: 'Volle', stripes: 'Halbe', open: 'Offener Tisch', foul: 'Foul · Ball in Hand', remaining: '{group} · noch {count}', ballInHand: 'Ball in Hand', lower: 'Nach links zielen', higher: 'Nach rechts zielen' },
  ro: { early: 'Bila 8 a intrat prea devreme', scratch: 'Bila albă a intrat cu bila 8', 'wrong-pocket': 'Bila 8 a intrat în buzunarul greșit', foulEight: 'Fault la bila 8', rotate: 'Mod peisaj', exitLandscape: 'Ieși din modul peisaj', guide: 'Trage pentru a ținti. Trage înapoi de la bila albă pentru a lovi.', requiredPocket: 'Bila 8 · {pocket}', topLeft: 'Sus stânga', topMiddle: 'Sus mijloc', topRight: 'Sus dreapta', bottomLeft: 'Jos stânga', bottomMiddle: 'Jos mijloc', bottomRight: 'Jos dreapta', table: 'Masă de biliard', aim: 'Unghi', power: 'Putere', shoot: 'Lovește', placeCue: 'Așază bila albă', aimCue: 'Țintește', solids: 'Pline', stripes: 'Dungate', open: 'Masă deschisă', foul: 'Fault · Bilă în mână', remaining: '{group} · {count} rămase', ballInHand: 'Bilă în mână', lower: 'Țintește la stânga', higher: 'Țintește la dreapta' },
});

type PoolView = Extract<HeadToHeadView['board'], { game: 'eight-ball' }>;
type Shot = Extract<HeadToHeadMove, { game: 'eight-ball' }>;
const FRAME_MS = 1000 / 15;
const POCKET_NAMES = ['topLeft', 'topMiddle', 'topRight', 'bottomLeft', 'bottomMiddle', 'bottomRight'] as const;
const angleOf = (angle: number) => (angle + 360) % 360;

export function PoolBoard({ view, board, names, canMove, onMove }: {
  view: HeadToHeadView; board: PoolView; names: [string, string]; canMove: boolean; onMove: (move: HeadToHeadMove) => void;
}) {
  const t = useTexts(TEXTS);
  const orientation = usePoolLandscape();
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastShot = useRef(board.shot);
  const pulling = useRef(false);
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(75);
  const [placing, setPlacing] = useState(false);
  const [cue, setCue] = useState<Shot['cue']>();
  const [roll, setRoll] = useState<{ shot: number; balls: PoolFrame }>();
  const rolling = roll?.shot === board.shot;
  const ready = canMove && view.turn === view.seat && !rolling;
  const balls = roll?.shot === board.shot ? roll.balls : board.balls;
  const placement = ready && board.ballInHand ? cue : undefined;
  const table = placement ? balls.map((ball): PoolFrame[number] => ball[0] === 0 ? [0, ...placement] : ball) : balls;

  useEffect(() => {
    if (lastShot.current === board.shot) return;
    lastShot.current = board.shot;
    setCue(undefined);
    setPlacing(false);
    setRoll(undefined);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || board.motion.length < 2) return;
    const start = performance.now();
    let frame = 0;
    const advance = (time: number) => {
      const position = Math.max(0, time - start) / FRAME_MS;
      const index = Math.floor(position);
      const next = board.motion[index + 1];
      if (!next) { setRoll(undefined); return; }
      const fraction = position - index;
      const to = new Map(next.map(ball => [ball[0], ball]));
      setRoll({ shot: board.shot, balls: board.motion[index]!.map(([id, x, y]) => {
        const ball = to.get(id);
        return ball ? [id, x + (ball[1] - x) * fraction, y + (ball[2] - y) * fraction] : [id, x, y];
      }) });
      frame = requestAnimationFrame(advance);
    };
    setRoll({ shot: board.shot, balls: board.motion[0]! });
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  // The motion belongs to this shot. Room snapshots can replace the board during playback.
  }, [board.shot]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paintPool(ctx, table, {
      aim: ready && !placing ? { angle, power } : undefined,
      placing: ready && placing, eightPocket: rolling ? null : board.eightPocket,
    });
  }, [table, ready, placing, angle, power, rolling, board.eightPocket, orientation.landscape]);

  const coordinates = (event: PointerEvent<HTMLCanvasElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const sideways = orientation.landscape && matchMedia('(orientation: portrait)').matches;
    const localX = sideways ? event.clientY - rect.top : event.clientX - rect.left;
    const localY = sideways ? rect.right - event.clientX : event.clientY - rect.top;
    return [Math.round((localX - element.clientLeft) * POOL_WIDTH / element.clientWidth),
      Math.round((localY - element.clientTop) * POOL_HEIGHT / element.clientHeight)] as const;
  };
  const white = table.find(([id]) => id === 0);
  const aimFrom = (x: number, y: number, pull = false) => {
    if (!white) return;
    const dx = x - white[1], dy = y - white[2];
    const distance = Math.hypot(dx, dy);
    if (distance <= 10) return;
    return { angle: angleOf(Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + (pull ? 180 : 0)),
      power: pull ? Math.max(1, Math.min(100, Math.round(distance / 1.45))) : power, distance };
  };
  const sendShot = (shotAngle: number, shotPower: number) => onMove({
    game: 'eight-ball', angle: shotAngle, power: shotPower, shot: board.shot, ...(placement ? { cue: placement } : {}),
  });
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || event.button !== 0 || !event.isPrimary) return;
    const [x, y] = coordinates(event);
    if (placing && board.ballInHand) {
      if (canPlacePoolCue(x, y, balls)) { setCue([x, y]); setPlacing(false); }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pulling.current = Boolean(white && Math.hypot(x - white[1], y - white[2]) <= 29);
    const next = pulling.current ? undefined : aimFrom(x, y);
    if (next) setAngle(next.angle);
  };
  const surface = <div className="pool">
    <canvas className="pool-table" ref={canvas} width={POOL_WIDTH} height={POOL_HEIGHT} role="img" aria-label={t('table')}
      data-shot={board.shot} data-rolling={rolling} data-aiming={ready} onPointerDown={down}
      onPointerMove={event => {
        if (!ready || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const next = aimFrom(...coordinates(event), pulling.current);
        if (next) { setAngle(next.angle); if (pulling.current) setPower(next.power); }
      }}
      onPointerUp={event => {
        const next = pulling.current && ready ? aimFrom(...coordinates(event), true) : undefined;
        pulling.current = false;
        if (next && next.distance >= 36) sendShot(next.angle, next.power);
      }} onLostPointerCapture={() => { pulling.current = false; }} />
    {board.solids === null ? <p className="pool-open">{t('open')}</p> : <ul className="pool-groups">
      {([0, 1] as const).map(seat => {
        const solid = board.solids === seat;
        const count = balls.filter(([id]) => solid ? id > 0 && id < 8 : id > 8).length;
        return <li key={seat}><strong>{names[seat]}</strong><span>{t('remaining', { group: t(solid ? 'solids' : 'stripes'), count })}</span></li>;
      })}
    </ul>}
    {view.seat !== null && !view.outcome && <div className="pool-controls">
      {board.ballInHand && ready && <button className="ghost" type="button" onClick={() => setPlacing(!placing)}>{t(placing ? 'aimCue' : 'placeCue')}</button>}
      <div className="pool-adjust">
        <button type="button" aria-label={t('lower')} disabled={!ready} onClick={() => setAngle(angleOf(angle - 1))}>−</button>
        <label>{t('aim')} <input type="range" min={0} max={359} value={angle} disabled={!ready} aria-valuetext={`${angle}°`} onChange={event => setAngle(event.currentTarget.valueAsNumber)} /></label>
        <button type="button" aria-label={t('higher')} disabled={!ready} onClick={() => setAngle(angleOf(angle + 1))}>+</button>
      </div>
      <div className="pool-adjust">
        <label>{t('power')} <input type="range" min={1} max={100} value={power} disabled={!ready} onChange={event => setPower(event.currentTarget.valueAsNumber)} /></label>
        <button className="primary" type="button" disabled={!ready || placing} onClick={() => sendShot(angle, power)}>{t('shoot')}</button>
      </div>
    </div>}
    {board.eightPocket !== null && !rolling && !view.outcome && <p className="pool-open pool-target">
      {t('requiredPocket', { pocket: t(POCKET_NAMES[board.eightPocket]!) })}
    </p>}
    {ready && board.shot === 0 && <p className="pool-open pool-instructions">{t('guide')}</p>}
    {board.ending && board.ending !== 'clean' && !rolling && <p className="pool-open pool-target" role="status">
      {t(board.ending === 'foul' ? 'foulEight' : board.ending)}
    </p>}
    {board.foul && !rolling && !view.outcome && <p className="pool-open" role="status">{t('foul')}</p>}
  </div>;
  if (orientation.landscape) return <dialog className="pool-landscape-dialog" ref={orientation.dialog} aria-label={t('table')}
    onCancel={event => { event.preventDefault(); orientation.close(); }}>
    <div className="pool-landscape-frame">
      <button type="button" className="ghost pool-landscape-exit" autoFocus onClick={orientation.close}>{t('exitLandscape')}</button>
      {surface}
    </div>
  </dialog>;
  return <>
    {view.seat !== null && !view.outcome && <button type="button" className="ghost small-button pool-landscape-button"
      onClick={() => void orientation.open()}>{t('rotate')}</button>}
    {surface}
  </>;
}

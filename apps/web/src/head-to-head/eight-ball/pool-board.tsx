import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { BALL_RADIUS, canPlacePoolCue, DEFAULT_POOL_START, poolLegalTarget, POOL_AIM_STEP, POOL_HEIGHT, POOL_POCKETS, POOL_WIDTH, type HeadToHeadMove, type HeadToHeadView, type PoolFrame, type PoolSpin } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { usePoolLandscape } from './landscape.js';
import { paintPool, type BallRotation } from './table.js';
import { PotTrays } from './pot-trays.js';
import { FaIcon } from '../../presentation/icons.js';
import { PoolSpinButton, PoolSpinPicker } from './spin-picker.js';
import '../../ui/game-slider.css';
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

const TARGET_TEXTS = defineTexts('pool-target', {
  break: 'Break shot', open: 'Open table', solid: 'Play solids', stripe: 'Play stripes', eight: 'Play the 8', assist: 'Aim assist', shortAssist: 'Assist', landscape: 'Landscape',
}, {
  nl: { break: 'Breakstoot', open: 'Open tafel', solid: 'Speel hele', stripe: 'Speel halve', eight: 'Speel de 8', assist: 'Richthulp', shortAssist: 'Hulp', landscape: 'Liggend' },
  de: { break: 'Anstoß', open: 'Offener Tisch', solid: 'Volle spielen', stripe: 'Halbe spielen', eight: 'Auf die Acht', assist: 'Zielhilfe', shortAssist: 'Zielhilfe', landscape: 'Querformat' },
  ro: { break: 'Spargere', open: 'Masă deschisă', solid: 'Joacă plinele', stripe: 'Joacă dungatele', eight: 'Joacă bila 8', assist: 'Asistență la țintire', shortAssist: 'Asistare', landscape: 'Peisaj' },
});

type PoolView = Extract<HeadToHeadView['board'], { game: 'eight-ball' }>;
type Shot = Extract<HeadToHeadMove, { game: 'eight-ball' }>;
const FRAME_MS = 1000 / 15;
const POCKET_NAMES = ['topLeft', 'topMiddle', 'topRight', 'bottomLeft', 'bottomMiddle', 'bottomRight'] as const;
const angleOf = (angle: number) => (Math.round(angle / POOL_AIM_STEP) * POOL_AIM_STEP + 360) % 360;
const powerFromPull = (distance: number) => Math.max(1, Math.min(100, Math.round(distance / 1.45)));
const AIM_ASSIST_KEY = 'party_pool_aim_assist';

export function PoolBoard({ view, board, names, canMove, onMove, statusLabel }: {
  view: HeadToHeadView; board: PoolView; names: [string, string]; canMove: boolean; onMove: (move: HeadToHeadMove) => void; statusLabel?: string | undefined;
}) {
  const t = useTexts(TEXTS);
  const targetText = useTexts(TARGET_TEXTS);
  const orientation = usePoolLandscape();
  const canvas = useRef<HTMLCanvasElement>(null);
  const rotations = useRef(new Map<number, BallRotation>());
  const lastShot = useRef(board.shot);
  const pulling = useRef(false);
  const startArea = board.start ?? DEFAULT_POOL_START;
  const [angle, setAngle] = useState(startArea.side === 'right' ? 180 : 0);
  const [power, setPower] = useState(75);
  const [objectGuide, setObjectGuide] = useState(() => {
    try { return localStorage.getItem(AIM_ASSIST_KEY) !== 'off'; } catch { return true; }
  });
  const [placing, setPlacing] = useState(false);
  const [spin, setSpin] = useState<PoolSpin>([0, 0]);
  const [editingSpin, setEditingSpin] = useState(false);
  const [cue, setCue] = useState<Shot['cue']>();
  const [roll, setRoll] = useState<{ shot: number; balls: PoolFrame; sinking?: Map<number, number> }>();
  const [shownPots, setShownPots] = useState<PoolView['potsBySeat']>(board.potsBySeat);
  const rolling = roll?.shot === board.shot;
  const ready = canMove && view.turn === view.seat && !rolling;
  const balls = roll?.shot === board.shot ? roll.balls : board.balls;
  const placement = ready && board.ballInHand ? cue : undefined;
  const table = placement ? balls.map((ball): PoolFrame[number] => ball[0] === 0 ? [0, ...placement] : ball) : balls;
  const target = !rolling && (view.turn === 0 || view.turn === 1) ? poolLegalTarget(board.balls,
    board.solids === null ? null : board.solids === view.turn ? 'solid' : 'stripe', board.shot === 0) : null;

  useEffect(() => {
    if (lastShot.current === board.shot) return;
    lastShot.current = board.shot;
    setCue(undefined);
    setPlacing(false);
    setSpin([0, 0]);
    setEditingSpin(false);
    setRoll(undefined);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || board.motion.length < 2) { setShownPots(board.potsBySeat); return; }
    const start = performance.now();
    const frameMs = Math.min(FRAME_MS, 4600 / (board.motion.length - 1));
    let previous = new Map(board.motion[0]!.map(ball => [ball[0], ball]));
    const rotateBalls = (next: PoolFrame) => {
      for (const ball of next) {
        const [id, x, y] = ball;
        const before = previous.get(id);
        if (!before) continue;
        const dx = x - before[1], dy = y - before[2];
        const distance = Math.hypot(dx, dy);
        if (distance < .04) continue;
        const old = rotations.current.get(id);
        rotations.current.set(id, { phase: ((old?.phase ?? 0) + distance / BALL_RADIUS) % (Math.PI * 2), direction: Math.atan2(dy, dx) });
      }
      previous = new Map(next.map(ball => [ball[0], ball]));
    };
    let frame = 0;
    const advance = (time: number) => {
      const position = Math.max(0, time - start) / frameMs;
      const index = Math.floor(position);
      const next = board.motion[index + 1];
      if (!next) { rotateBalls(board.motion.at(-1)!); setShownPots(board.potsBySeat); setRoll(undefined); return; }
      const fraction = position - index;
      const to = new Map(next.map(ball => [ball[0], ball]));
      const sinking = new Map<number, number>();
      const picture: PoolFrame = board.motion[index]!.map(([id, x, y]) => {
        const ball = to.get(id);
        if (ball) return [id, x + (ball[1] - x) * fraction, y + (ball[2] - y) * fraction];
        const [px, py] = POOL_POCKETS.reduce((nearest, pocket) =>
          Math.hypot(pocket[0] - x, pocket[1] - y) < Math.hypot(nearest[0] - x, nearest[1] - y) ? pocket : nearest);
        sinking.set(id, 1 - fraction);
        return [id, x + (px - x) * fraction, y + (py - y) * fraction];
      });
      rotateBalls(picture);
      setRoll({ shot: board.shot, balls: picture, sinking });
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
      placing: ready && placing, eightPocket: rolling ? null : board.eightPocket, rotations: rotations.current, target, objectGuide, start: startArea, sinking: roll?.sinking,
    });
  }, [table, ready, placing, angle, power, rolling, board.eightPocket, orientation.landscape, target, objectGuide, startArea, roll]);

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
  const aimFrom = (x: number, y: number) => {
    if (!white) return;
    const dx = x - white[1], dy = y - white[2];
    if (Math.hypot(dx, dy) <= BALL_RADIUS) return;
    return angleOf(Math.atan2(dy, dx) * 180 / Math.PI);
  };
  const pullDistance = (x: number, y: number) => {
    if (!white) return 0;
    const radians = angle * Math.PI / 180;
    return (white[1] - x) * Math.cos(radians) + (white[2] - y) * Math.sin(radians);
  };
  const sendShot = (shotAngle: number, shotPower: number) => onMove({
    game: 'eight-ball', angle: shotAngle, power: shotPower, shot: board.shot, ...(placement ? { cue: placement } : {}),
    ...(spin[0] || spin[1] ? { spin } : {}),
  });
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || editingSpin || event.button !== 0 || !event.isPrimary) return;
    const [x, y] = coordinates(event);
    if (placing && board.ballInHand) {
      if (canPlacePoolCue(x, y, balls, startArea)) { setCue([x, y]); setPlacing(false); }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pulling.current = Boolean(white && Math.hypot(x - white[1], y - white[2]) <= 29);
    const next = pulling.current ? undefined : aimFrom(x, y);
    if (next !== undefined) setAngle(next);
  };
  const surface = <div className="pool">
    {!view.outcome && <div className="pool-toolbar">
      <p className="pool-current" role="status"><strong>{statusLabel}</strong>{target && <span>{targetText(target)}</span>}</p>
      {view.seat !== null && <button type="button" className="pool-aim-assist" aria-label={targetText('assist')} aria-pressed={objectGuide} onClick={() => {
        setObjectGuide(!objectGuide);
        try { localStorage.setItem(AIM_ASSIST_KEY, objectGuide ? 'off' : 'on'); } catch { /* optional preference */ }
      }}><span aria-hidden="true" />{targetText('shortAssist')}</button>}
      {view.seat !== null && !orientation.landscape && <button type="button" className="pool-landscape-button" aria-label={t('rotate')}
        onClick={() => void orientation.open()}><FaIcon name="rotate" />{targetText('landscape')}</button>}
      {orientation.landscape && <button type="button" className="ghost pool-landscape-exit" autoFocus onClick={orientation.close}>{t('exitLandscape')}</button>}
    </div>}
    {orientation.landscape && view.outcome && <div className="pool-toolbar">
      <p className="pool-current" role="status"><strong>{statusLabel}</strong></p>
      <button type="button" className="ghost pool-landscape-exit" onClick={orientation.close}>{t('exitLandscape')}</button>
    </div>}
    <canvas className="pool-table" ref={canvas} width={POOL_WIDTH} height={POOL_HEIGHT} role="img" aria-label={t('table')}
      data-shot={board.shot} data-rolling={rolling} data-aiming={ready} onPointerDown={down}
      onPointerMove={event => {
        if (!ready || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        if (pulling.current) {
          setPower(powerFromPull(pullDistance(...coordinates(event))));
        } else {
          const next = aimFrom(...coordinates(event));
          if (next !== undefined) setAngle(next);
        }
      }}
      onPointerUp={event => {
        const distance = pulling.current && ready ? pullDistance(...coordinates(event)) : 0;
        pulling.current = false;
        if (distance >= 24) sendShot(angle, powerFromPull(distance));
      }} onLostPointerCapture={() => { pulling.current = false; }} />
    <PotTrays names={names} pots={shownPots ?? [[], []]} turn={view.turn === 'both' ? null : view.turn} />
    {board.ballInHand && ready && !editingSpin && <button className="ghost pool-place" type="button"
      onClick={() => setPlacing(!placing)}>{t(placing ? 'aimCue' : 'placeCue')}</button>}
    {view.seat !== null && !view.outcome && <div className="pool-controls">
      {editingSpin && ready ? <PoolSpinPicker value={spin} onChange={setSpin} onDone={() => setEditingSpin(false)}
        sideways={orientation.landscape && matchMedia('(orientation: portrait)').matches} /> : <>
      <div className="pool-adjust pool-aim">
        <button type="button" aria-label={t('lower')} disabled={!ready || placing} onClick={() => setAngle(angleOf(angle - POOL_AIM_STEP))}>−</button>
        <label><span>{t('aim')} <strong aria-hidden="true">{angle}°</strong></span>
          <input className="game-slider slider-ring" type="range" min={0} max={360 - POOL_AIM_STEP} step={POOL_AIM_STEP} value={angle}
            disabled={!ready || placing} aria-valuetext={`${angle}°`} onChange={event => setAngle(event.currentTarget.valueAsNumber)} />
        </label>
        <button type="button" aria-label={t('higher')} disabled={!ready || placing} onClick={() => setAngle(angleOf(angle + POOL_AIM_STEP))}>+</button>
      </div>
      <label className="pool-power"><span>{t('power')} <strong aria-hidden="true">{power}%</strong></span>
        <input className="game-slider slider-notch" type="range" min={1} max={100} value={power}
          disabled={!ready || placing} aria-valuetext={`${power}%`} style={{ '--pool-power': `${power}%` } as CSSProperties}
          onChange={event => setPower(event.currentTarget.valueAsNumber)} />
      </label>
      <div className="pool-shot-actions">
        <PoolSpinButton value={spin} disabled={!ready || placing} onClick={() => setEditingSpin(true)} />
        <button className="primary" type="button" disabled={!ready || placing} onClick={() => sendShot(angle, power)}>{t('shoot')}</button>
      </div></>}
    </div>}
    {board.eightPocket !== null && !rolling && !view.outcome && <p className="pool-open pool-target">
      {t('requiredPocket', { pocket: t(POCKET_NAMES[board.eightPocket]!) })}
    </p>}
    {board.ending && board.ending !== 'clean' && !rolling && <p className="pool-open pool-target" role="status">
      {t(board.ending === 'foul' ? 'foulEight' : board.ending)}
    </p>}
    {board.foul && !rolling && !view.outcome && <p className="pool-open" role="status">{t('foul')}</p>}
  </div>;
  if (orientation.landscape) return <dialog className="pool-landscape-dialog" ref={orientation.dialog} aria-label={t('table')}
    onCancel={event => { event.preventDefault(); orientation.close(); }}>
    <div className="pool-landscape-frame">
      {surface}
    </div>
  </dialog>;
  return surface;
}

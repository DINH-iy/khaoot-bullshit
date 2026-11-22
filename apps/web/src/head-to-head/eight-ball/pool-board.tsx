import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { BALL_RADIUS, canPlacePoolCue, DEFAULT_POOL_START, poolLegalTarget, POOL_AIM_STEP, shootPool, type HeadToHeadMove, type HeadToHeadView, type PoolFrame, type PoolSpin } from '@party/contracts';
import { defineTexts, useTexts } from '../../i18n/texts.js';
import { usePoolLandscape } from './landscape.js';
import { paintPool, POOL_CANVAS_HEIGHT, POOL_CANVAS_WIDTH, POOL_RAIL } from './table.js';
import { usePoolPlayback, type PredictedPoolShot } from './playback.js';
import { preloadPoolSounds } from './impact-sound.js';
import { isPoolCueShaftAt, poolCueOffset } from './aim.js';
import { unlockSound } from '../../room-extras/celebrate.js';
import { PotTrays } from './pot-trays.js';
import { FaIcon } from '../../presentation/icons.js';
import { PoolSpinButton, PoolSpinPicker } from './spin-picker.js';
import '../../ui/game-slider.css';
import './pool.css';

const TEXTS = defineTexts('eight-ball', {
  rotate: 'Rotate table', exitLandscape: 'Exit landscape', guide: 'Drag to aim. Pull back from the cue ball to shoot.',
  requiredPocket: '8 ball · {pocket}', topLeft: 'Top left', topMiddle: 'Top middle', topRight: 'Top right',
  bottomLeft: 'Bottom left', bottomMiddle: 'Bottom middle', bottomRight: 'Bottom right',
  early: '8 ball sunk early', scratch: 'Scratch on the 8', 'wrong-pocket': '8 ball sunk in the wrong pocket', foulEight: 'Foul on the 8',
  table: 'Pool table', aim: 'Aim', power: 'Power', shoot: 'Shoot', placeCue: 'Place cue ball', aimCue: 'Aim cue',
  solids: 'Solids', stripes: 'Stripes', open: 'Open table', foul: 'Foul · Ball in hand',
  remaining: '{group} · {count} left', ballInHand: 'Ball in hand', lower: 'Aim left', higher: 'Aim right',
}, {
  nl: { early: '8-bal te vroeg gepot', scratch: 'Witte bal gepot bij de 8-bal', 'wrong-pocket': '8-bal in de verkeerde pocket', foulEight: 'Fout bij de 8-bal', rotate: 'Draai tafel', exitLandscape: 'Liggende stand verlaten', guide: 'Sleep om te richten. Trek vanaf de witte bal terug om te stoten.', requiredPocket: '8-bal · {pocket}', topLeft: 'Linksboven', topMiddle: 'Middenboven', topRight: 'Rechtsboven', bottomLeft: 'Linksonder', bottomMiddle: 'Middenonder', bottomRight: 'Rechtsonder', table: 'Pooltafel', aim: 'Richting', power: 'Kracht', shoot: 'Stoot', placeCue: 'Witte bal plaatsen', aimCue: 'Richten', solids: 'Hele', stripes: 'Halve', open: 'Open tafel', foul: 'Fout · Bal in de hand', remaining: '{group} · nog {count}', ballInHand: 'Bal in de hand', lower: 'Richt links', higher: 'Richt rechts' },
  de: { early: 'Acht zu früh versenkt', scratch: 'Spielball mit der Acht versenkt', 'wrong-pocket': 'Acht in der falschen Tasche', foulEight: 'Foul bei der Acht', rotate: 'Tisch drehen', exitLandscape: 'Querformat verlassen', guide: 'Zum Zielen ziehen. Zum Stoßen vom Spielball zurückziehen.', requiredPocket: 'Acht · {pocket}', topLeft: 'Oben links', topMiddle: 'Oben Mitte', topRight: 'Oben rechts', bottomLeft: 'Unten links', bottomMiddle: 'Unten Mitte', bottomRight: 'Unten rechts', table: 'Billardtisch', aim: 'Winkel', power: 'Stärke', shoot: 'Stoßen', placeCue: 'Spielball platzieren', aimCue: 'Zielen', solids: 'Volle', stripes: 'Halbe', open: 'Offener Tisch', foul: 'Foul · Ball in Hand', remaining: '{group} · noch {count}', ballInHand: 'Ball in Hand', lower: 'Nach links zielen', higher: 'Nach rechts zielen' },
  ro: { early: 'Bila 8 a intrat prea devreme', scratch: 'Bila albă a intrat cu bila 8', 'wrong-pocket': 'Bila 8 a intrat în buzunarul greșit', foulEight: 'Fault la bila 8', rotate: 'Rotește masa', exitLandscape: 'Ieși din modul peisaj', guide: 'Trage pentru a ținti. Trage înapoi de la bila albă pentru a lovi.', requiredPocket: 'Bila 8 · {pocket}', topLeft: 'Sus stânga', topMiddle: 'Sus mijloc', topRight: 'Sus dreapta', bottomLeft: 'Jos stânga', bottomMiddle: 'Jos mijloc', bottomRight: 'Jos dreapta', table: 'Masă de biliard', aim: 'Unghi', power: 'Putere', shoot: 'Lovește', placeCue: 'Așază bila albă', aimCue: 'Țintește', solids: 'Pline', stripes: 'Dungate', open: 'Masă deschisă', foul: 'Fault · Bilă în mână', remaining: '{group} · {count} rămase', ballInHand: 'Bilă în mână', lower: 'Țintește la stânga', higher: 'Țintește la dreapta' },
});

const TARGET_TEXTS = defineTexts('pool-target', {
  break: 'Break shot', open: 'Open table', solid: 'Play solids', stripe: 'Play stripes', eight: 'Play the 8', assist: 'Aim assist', shortAssist: 'Assist',
}, {
  nl: { break: 'Breakstoot', open: 'Open tafel', solid: 'Speel hele', stripe: 'Speel halve', eight: 'Speel de 8', assist: 'Richthulp', shortAssist: 'Hulp' },
  de: { break: 'Anstoß', open: 'Offener Tisch', solid: 'Volle spielen', stripe: 'Halbe spielen', eight: 'Auf die Acht', assist: 'Zielhilfe', shortAssist: 'Zielhilfe' },
  ro: { break: 'Spargere', open: 'Masă deschisă', solid: 'Joacă plinele', stripe: 'Joacă dungatele', eight: 'Joacă bila 8', assist: 'Asistență la țintire', shortAssist: 'Asistare' },
});

const RESPOT_TEXT = defineTexts('pool-respot', { eight: '8 ball returned to the table' }, {
  nl: { eight: '8-bal terug op tafel' }, de: { eight: 'Die Acht liegt wieder auf dem Tisch' }, ro: { eight: 'Bila 8 a fost repusă pe masă' },
});

type PoolView = Extract<HeadToHeadView['board'], { game: 'eight-ball' }>;
type Shot = Extract<HeadToHeadMove, { game: 'eight-ball' }>;
type CueDrag = { pointerId: number; x: number; y: number; angle: number; offset: number };
const STRIKE_MS = 65;
const POCKET_NAMES = ['topLeft', 'topMiddle', 'topRight', 'bottomLeft', 'bottomMiddle', 'bottomRight'] as const;
const angleOf = (angle: number) => (Math.round(angle / POOL_AIM_STEP) * POOL_AIM_STEP + 360) % 360;
const powerFromPull = (distance: number) => Math.max(1, Math.min(100, Math.round(distance / 1.45)));
const AIM_ASSIST_KEY = 'party_pool_aim_assist';

export function PoolBoard({ view, board, names, canMove, onMove, statusLabel }: {
  view: HeadToHeadView; board: PoolView; names: [string, string]; canMove: boolean; onMove: (move: HeadToHeadMove) => void; statusLabel?: string | undefined;
}) {
  const t = useTexts(TEXTS);
  const targetText = useTexts(TARGET_TEXTS);
  const respotText = useTexts(RESPOT_TEXT);
  const orientation = usePoolLandscape();
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastShot = useRef(board.shot);
  const cueDrag = useRef<CueDrag>(undefined);
  const [pulledDistance, setPulledDistance] = useState<number>();
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
  const [prediction, setPrediction] = useState<PredictedPoolShot>();
  const { roll, rotations, shownPots } = usePoolPlayback(board, prediction);
  const [strike, setStrike] = useState<{ angle: number; power: number; shot: number; start: number; pull?: number | undefined }>();
  const [strikeProgress, setStrikeProgress] = useState(0);
  const waitingForShot = prediction?.shot === board.shot + 1;
  const rolling = Boolean(roll && (roll.shot === board.shot || waitingForShot && roll.shot === prediction?.shot));
  const striking = strike && (strike.shot === board.shot || strike.shot === board.shot - 1) ? strike : undefined;
  const ready = canMove && view.turn === view.seat && !rolling && !striking && !waitingForShot;
  const aimAngle = cueDrag.current?.angle ?? angle;
  const pullOffset = cueDrag.current && pulledDistance !== undefined ? cueDrag.current.offset + pulledDistance : undefined;
  const shownPower = pulledDistance === undefined ? power : powerFromPull(pulledDistance);
  const balls = rolling && roll ? roll.balls : board.balls;
  const placement = ready && board.ballInHand ? cue : undefined;
  const table = placement ? balls.map((ball): PoolFrame[number] => ball[0] === 0 ? [0, ...placement] : ball) : balls;
  const target = !rolling && (view.turn === 0 || view.turn === 1) ? poolLegalTarget(board.balls,
    board.solids === null ? null : board.solids === view.turn ? 'solid' : 'stripe', board.shot === 0) : null;
  const breakFinish = board.shot === 1 ? board.motion.at(-1) : undefined;
  const respottedEight = !rolling && !striking && Boolean(breakFinish && !breakFinish.some(([id]) => id === 8) && board.balls.some(([id]) => id === 8));

  useLayoutEffect(() => {
    if (!strike) return;
    let frame: number;
    const advance = (time: number) => {
      const progress = (time - strike.start) / STRIKE_MS;
      if (progress >= 1) { setStrike(undefined); return; }
      setStrikeProgress(Math.max(0, progress));
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [strike]);

  useLayoutEffect(() => {
    if (lastShot.current === board.shot) return;
    lastShot.current = board.shot;
    setCue(undefined);
    setPlacing(false);
    setSpin([0, 0]);
    setEditingSpin(false);
  }, [board.shot]);

  useLayoutEffect(() => {
    if (waitingForShot && (canMove || view.outcome)) {
      setPrediction(undefined);
      setStrike(undefined);
    }
  }, [waitingForShot, canMove, view.outcome]);

  useLayoutEffect(() => {
    cueDrag.current = undefined;
    setPulledDistance(undefined);
  }, [board.shot, orientation.landscape, ready, placing, editingSpin]);

  useEffect(() => {
    preloadPoolSounds();
    window.addEventListener('pointerup', unlockSound, { once: true });
    window.addEventListener('keydown', unlockSound, { once: true });
    return () => {
      window.removeEventListener('pointerup', unlockSound);
      window.removeEventListener('keydown', unlockSound);
    };
  }, []);

  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paintPool(ctx, table, {
      aim: ready && !placing ? { angle: aimAngle, power, pull: pullOffset } : undefined,
      strike: striking ? { angle: striking.angle, power: striking.power, progress: strikeProgress, pull: striking.pull } : undefined,
      respottedEight,
      placing: ready && placing, eightPocket: rolling ? null : board.eightPocket, rotations: rotations.current, target, objectGuide, start: startArea, sinking: roll?.sinking,
    });
  }, [table, ready, placing, aimAngle, power, pullOffset, rolling, board.eightPocket, orientation.landscape, target, objectGuide, startArea, roll, striking, strikeProgress, respottedEight]);

  const coordinates = (event: PointerEvent<HTMLCanvasElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const sideways = orientation.landscape && matchMedia('(orientation: portrait)').matches;
    const localX = sideways ? event.clientY - rect.top : event.clientX - rect.left;
    const localY = sideways ? rect.right - event.clientX : event.clientY - rect.top;
    return [Math.round(localX * POOL_CANVAS_WIDTH / (sideways ? rect.height : rect.width) - POOL_RAIL),
      Math.round(localY * POOL_CANVAS_HEIGHT / (sideways ? rect.width : rect.height) - POOL_RAIL)] as const;
  };
  const white = table.find(([id]) => id === 0);
  const aimFrom = (x: number, y: number) => {
    if (!white) return;
    const dx = x - white[1], dy = y - white[2];
    if (Math.hypot(dx, dy) <= BALL_RADIUS) return;
    return angleOf(Math.atan2(dy, dx) * 180 / Math.PI);
  };
  const pullDistance = (drag: CueDrag, x: number, y: number) => {
    const radians = drag.angle * Math.PI / 180;
    return Math.max(0, Math.min(145, (drag.x - x) * Math.cos(radians) + (drag.y - y) * Math.sin(radians)));
  };
  const cancelCueDrag = (pointerId: number) => {
    if (cueDrag.current?.pointerId !== pointerId) return;
    cueDrag.current = undefined;
    setPulledDistance(undefined);
  };
  const sendShot = (shotAngle: number, shotPower: number, pull?: number) => {
    if (!ready || placing) return;
    unlockSound();
    onMove({ game: 'eight-ball', angle: shotAngle, power: shotPower, shot: board.shot, ...(placement ? { cue: placement } : {}),
      ...(spin[0] || spin[1] ? { spin } : {}) });
    if (white && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const start = performance.now();
      const resolved = shootPool(table, shotAngle, shotPower, board.ballBehavior, spin[0] || spin[1] ? spin : undefined);
      setPrediction({ shot: board.shot + 1, motion: resolved.motion, impacts: resolved.impacts, start: start + STRIKE_MS });
      setStrikeProgress(0);
      setStrike({ angle: shotAngle, power: shotPower, shot: board.shot, start, pull });
    }
  };
  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || editingSpin || event.button !== 0 || !event.isPrimary) return;
    const [x, y] = coordinates(event);
    if (placing && board.ballInHand) {
      if (canPlacePoolCue(x, y, balls, startArea)) { setCue([x, y]); setPlacing(false); }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const tolerance = (event.pointerType === 'mouse' ? 8 : 18) * POOL_CANVAS_WIDTH / event.currentTarget.clientWidth;
    if (white && (Math.hypot(x - white[1], y - white[2]) <= 29 || isPoolCueShaftAt(white, angle, power, x, y, tolerance))) {
      cueDrag.current = { pointerId: event.pointerId, x, y, angle, offset: poolCueOffset(power) };
      return;
    }
    const next = aimFrom(x, y);
    if (next !== undefined) setAngle(next);
  };
  const toolbar = (!view.outcome || orientation.landscape) && <div className="pool-toolbar">
      <p className="pool-current" role="status"><strong>{statusLabel}</strong>{respottedEight ? <span>{respotText('eight')}</span> : target && <span>{targetText(target)}</span>}</p>
      {!view.outcome && view.seat !== null && <button type="button" className="pool-aim-assist" aria-label={targetText('assist')} aria-pressed={objectGuide} onClick={() => {
        setObjectGuide(!objectGuide);
        try { localStorage.setItem(AIM_ASSIST_KEY, objectGuide ? 'off' : 'on'); } catch { /* optional preference */ }
      }}><span aria-hidden="true" />{targetText('shortAssist')}</button>}
      {view.seat !== null && !orientation.landscape && <button type="button" className="pool-landscape-button" onClick={() => void orientation.open()}><FaIcon name="rotate" />{t('rotate')}</button>}
      {orientation.landscape && <button type="button" className="ghost pool-landscape-exit" aria-label={t('exitLandscape')} autoFocus onClick={orientation.close}>
        <FaIcon name="xmark" />
      </button>}
    </div>;
  const playfield = <div className="pool-playfield">
      {view.seat !== null && !view.outcome && <label className="pool-power">
        <input className="game-slider" type="range" min={1} max={100} value={shownPower} aria-label={t('power')} aria-orientation="vertical"
          disabled={!ready || placing || editingSpin} aria-valuetext={`${shownPower}%`} style={{ '--pool-power': `${shownPower}%` } as CSSProperties}
          onChange={event => setPower(event.currentTarget.valueAsNumber)} />
        <span aria-hidden="true">{shownPower}%</span>
      </label>}
      <canvas className="pool-table" ref={canvas} width={POOL_CANVAS_WIDTH} height={POOL_CANVAS_HEIGHT} role="img" aria-label={t('table')}
        data-shot={board.shot} data-rolling={rolling} data-aiming={ready} data-striking={Boolean(striking)} onPointerDown={down}
        onPointerMove={event => {
          if (!ready || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const drag = cueDrag.current;
          if (drag?.pointerId === event.pointerId) {
            setPulledDistance(pullDistance(drag, ...coordinates(event)));
          } else {
            const next = aimFrom(...coordinates(event));
            if (next !== undefined) setAngle(next);
          }
        }}
        onPointerUp={event => {
          const drag = cueDrag.current;
          if (drag?.pointerId !== event.pointerId) return;
          cancelCueDrag(event.pointerId);
          const distance = ready && !editingSpin ? pullDistance(drag, ...coordinates(event)) : 0;
          if (distance >= 24) {
            const shotPower = powerFromPull(distance);
            setPower(shotPower);
            sendShot(drag.angle, shotPower, drag.offset + distance);
          }
        }} onPointerCancel={event => cancelCueDrag(event.pointerId)} onLostPointerCapture={event => cancelCueDrag(event.pointerId)} />
    </div>;
  const trays = <PotTrays names={names} pots={shownPots ?? [[], []]} turn={view.turn === 'both' ? null : view.turn} />;
  const controls = <>
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
  </>;
  if (orientation.landscape) return <dialog className="pool-landscape-dialog" ref={orientation.dialog} aria-label={t('table')}
    onCancel={event => { event.preventDefault(); orientation.close(); }}>
    <div className="pool-landscape-frame">
      <div className="pool">
        {playfield}
        <div className="pool-landscape-controls">{toolbar}{controls}{trays}</div>
      </div>
    </div>
  </dialog>;
  return <div className="pool">{toolbar}{playfield}{trays}{controls}</div>;
}

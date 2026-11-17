import { useEffect, useId, useRef, useState } from 'react';
import { buildLook, LookContext, themeStyle } from '../../presentation/look.js';
import { WheelDisc } from '../../room-extras/show-extras.js';
import { layerOf } from '../look/layer.js';
import type { Definition } from '../model.js';

/** The disc's angle right now (0–360), also halfway through a turn. */
const angleOf = (disc: HTMLElement) => { const matrix = new DOMMatrix(getComputedStyle(disc).transform); return ((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI + 360) % 360; };

/**
 * A test spin of a wheel in the editor: the real wheel, in the game's look, landing
 * on a random entry. Click the wheel (or Spin) to turn it; clicking again while it
 * turns gives it a boost, so it keeps going longer. Nothing is saved.
 */
export function WheelTest({ definition, wheel, onClose }: {
  definition: Definition; wheel: { title: string; entries: { label: string }[]; spinSeconds: number; colors?: string[] | undefined }; onClose: () => void;
}) {
  const look = buildLook({ themes: [layerOf(definition, { kind: 'game' }).theme] });
  const entries = wheel.entries.map(entry => entry.label);
  const [result, setResult] = useState<number | null>(null); const [spinning, setSpinning] = useState(false); const [boosts, setBoosts] = useState(0);
  const box = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null); const turning = useRef<Animation | null>(null); const id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('.actions button.accent')?.focus(); return () => { turning.current?.cancel(); previous?.focus?.(); }; }, []);
  const spin = () => {
    const disc = stage.current?.querySelector<HTMLElement>('.wheel-disc'); if (!disc) return;
    const index = Math.floor(Math.random() * entries.length); const slice = 360 / entries.length;
    const boost = spinning ? boosts + 1 : 0; setBoosts(boost);
    // From where it is now, several turns (more with every boost), ending with the picked slice under the pointer.
    const from = angleOf(disc); const land = (360 - (index * slice + slice / 2)) % 360;
    const to = from + 360 * (5 + boost * 3) + ((land - from + 360) % 360);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    turning.current?.cancel(); setResult(null);
    if (still || typeof disc.animate !== 'function') { disc.style.transform = `rotate(${land}deg)`; setResult(index); return; }
    disc.style.transform = `rotate(${land}deg)`;
    // A boost starts fast from the current angle, so the wheel speeds up and keeps going.
    const animation = disc.animate([{ transform: `rotate(${from}deg)` }, { transform: `rotate(${to}deg)` }], { duration: wheel.spinSeconds * 1000 * (1 + boost * .4), easing: 'cubic-bezier(.15, .75, .2, 1)' });
    turning.current = animation; setSpinning(true);
    animation.onfinish = () => { if (turning.current === animation) { setSpinning(false); setBoosts(0); setResult(index); } };
  };
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} className="ed-dialog wheel-test" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <h2 id={`${id}-title`}>Test spin: {wheel.title}</h2>
      <p>The wheel as the shared screen shows it, in this game's look. Click the wheel to turn it; click again while it turns for a boost. Not saved.</p>
      <LookContext.Provider value={look}>
        <div ref={stage} className="wheel-test-stage" style={themeStyle(look.theme)}>
          {/* Clicking the wheel itself does what the Spin / Boost button does (that button is the keyboard's way). */}          <div className={`wheel-hit${spinning ? ' turning' : ''}`} title={spinning ? 'Click for a boost' : 'Click to turn the wheel'} onClick={spin}>
            <WheelDisc entries={entries} index={0} seconds={wheel.spinSeconds} spinKey="test" colors={wheel.colors} still /></div>
          <p className={`wheel-result${result !== null ? ' shown' : ''}`} role="status">{result !== null ? entries[result] : spinning ? (boosts ? `Boost${boosts > 1 ? ` ×${boosts}` : ''}!` : '…') : ' '}</p>
        </div>
      </LookContext.Provider>
      <div className="actions"><button type="button" onClick={onClose}>Close</button><button type="button" className="accent" onClick={spin}>{spinning ? 'Boost' : result !== null ? 'Spin again' : 'Spin'}</button></div>
    </div>
  </div>;
}

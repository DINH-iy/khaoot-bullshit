import { useEffect, useId, useRef, useState } from 'react';
import { buildLook, LookContext, themeStyle } from '../../presentation/look.js';
import { WheelDisc } from '../../room-extras/show-extras.js';
import { layerOf } from '../look/layer.js';
import type { Definition } from '../model.js';

/**
 * A test spin of a wheel in the editor: the real wheel, in the game's look, landing
 * on a random entry. Nothing is saved and the game is not touched.
 */
export function WheelTest({ definition, wheel, onClose }: {
  definition: Definition; wheel: { title: string; entries: { label: string }[]; spinSeconds: number; colors?: string[] | undefined }; onClose: () => void;
}) {
  const look = buildLook({ themes: [layerOf(definition, { kind: 'game' }).theme] });
  const entries = wheel.entries.map(entry => entry.label);
  const [spin, setSpin] = useState<{ index: number; key: string; at: number } | null>(null);
  const [done, setDone] = useState(false);
  const box = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('button')?.focus(); return () => previous?.focus?.(); }, []);
  // The result shows once the wheel has stopped (at once for people who ask for less motion).
  useEffect(() => {
    if (!spin) return; setDone(false);
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setDone(true), still ? 0 : wheel.spinSeconds * 1000); return () => clearTimeout(timer);
  }, [spin, wheel.spinSeconds]);
  const go = () => setSpin({ index: Math.floor(Math.random() * entries.length), key: String(Date.now()), at: Date.now() });
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} className="ed-dialog wheel-test" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <h2 id={`${id}-title`}>Test spin: {wheel.title}</h2>
      <p>The wheel as the shared screen shows it, in this game's look. A test spin is not saved.</p>
      <LookContext.Provider value={look}>
        <div className="wheel-test-stage" style={themeStyle(look.theme)}>
          <WheelDisc entries={entries} index={spin?.index ?? 0} seconds={wheel.spinSeconds} spinKey={spin?.key ?? 'still'} colors={wheel.colors} still={!spin} />
          <p className={`wheel-result${spin && done ? ' shown' : ''}`} role="status">{spin ? (done ? entries[spin.index] : '…') : ' '}</p>
        </div>
      </LookContext.Provider>
      <div className="actions"><button type="button" onClick={onClose}>Close</button><button type="button" className="accent" onClick={go}>{spin ? 'Spin again' : 'Spin'}</button></div>
    </div>
  </div>;
}

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { FullTheme } from '@party/contracts';
import { applyPalette, namedColors, parsePaletteFile, parsePaletteText, toAse, toHexList, toTokens } from './palette.js';

type Colors = FullTheme['colors'];

/** A small popup in the editor's style; Escape or a click outside closes it. */
function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null); const id = useId();
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; box.current?.querySelector<HTMLElement>('textarea, button')?.focus(); return () => previous?.focus?.(); }, []);
  return <div className="ed-dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={box} className="ed-dialog palette-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </div>
  </div>;
}

const Swatches = ({ colors }: { colors: string[] }) => <span className="palette-swatches" aria-hidden="true">{colors.map(color => <i key={color} style={{ background: color }} title={color} />)}</span>;

/**
 * Import colours: paste anything with colours in it (hex codes from Canva or Figma, a
 * Coolors link, CSS, design-token JSON, SVG) or choose a palette file (.ase from Adobe,
 * Procreate or Affinity; .gpl, .json, .css, .txt, .svg). Shows what was found first.
 */
export function ImportPalette({ onApply, onClose }: { onApply: (colors: Partial<Colors>) => void; onClose: () => void }) {
  const [text, setText] = useState(''); const [fromFile, setFromFile] = useState<{ name: string; colors: string[] } | null>(null); const [error, setError] = useState('');
  const colors = fromFile?.colors ?? parsePaletteText(text);
  const choose = (file: File | undefined) => {
    if (!file) return; setError('');
    if (file.size > 1_000_000) { setError('That file is too large for a palette.'); return; }
    parsePaletteFile(file).then(found => { setFromFile({ name: file.name, colors: found }); if (!found.length) setError(`No colours found in “${file.name}”.`); }, () => setError('That file could not be read.'));
  };
  return <Popup title="Import colours" onClose={onClose}>
    <p>Paste colours from Canva, Figma or Coolors: hex codes (#009ee2), a Coolors link, CSS or design tokens. Or choose a palette file.</p>
    <label>Colours<textarea rows={4} value={text} placeholder={'#009ee2 #f39200 #7ac6b6\nor https://coolors.co/009ee2-f39200-7ac6b6'} onChange={event => { setText(event.target.value); setFromFile(null); setError(''); }} /></label>
    <label className="palette-file">Or a file (.ase, .gpl, .json, .css, .txt, .svg)<input type="file" accept=".ase,.gpl,.json,.css,.txt,.svg,text/plain,application/json" onChange={event => choose(event.target.files?.[0])} /></label>
    {error ? <p role="alert" className="hint warn">{error}</p>
      : <p role="status" className="palette-found">{colors.length ? <>{`Found ${colors.length} ${colors.length === 1 ? 'colour' : 'colours'}${fromFile ? ` in ${fromFile.name}` : ''}`}<Swatches colors={colors} /></> : 'No colours found yet.'}</p>}
    {colors.length > 8 && <p className="hint">The first 8 become answer colours.</p>}
    <p className="hint">They become the answer tiles and the main buttons; the text on them turns black or white, whichever reads best. The background stays as it is.</p>
    <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="accent" disabled={!colors.length} onClick={() => { onApply(applyPalette(colors)); onClose(); }}>Use these colours</button></div>
  </Popup>;
}

/** Export colours: copy the hex codes, or download design tokens (.json) or an Adobe swatch file (.ase). */
export function ExportPalette({ colors, title, onClose }: { colors: Colors; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState('');
  const fileName = (title.trim() || 'game').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'game';
  const download = (data: BlobPart, type: string, extension: string) => {
    const url = URL.createObjectURL(new Blob([data], { type })); const link = document.createElement('a');
    link.href = url; link.download = `${fileName}-colours.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = () => navigator.clipboard.writeText(toHexList(colors)).then(() => setCopied('Copied. Paste them into Canva’s brand kit, Figma or Coolors.'), () => setCopied('Copying did not work here. Select the codes below and copy them.'));
  return <Popup title="Export colours" onClose={onClose}>
    <Swatches colors={namedColors(colors).map(color => color.hex)} />
    <div className="palette-exports">
      <button type="button" onClick={copy}><strong>Copy hex codes</strong><small>For Canva’s brand kit, Figma, Colors</small></button>
      <button type="button" onClick={() => download(toTokens(colors, title), 'application/json', 'json')}><strong>Design tokens (.json)</strong><small>For Figma with Tokens Studio, and code</small></button>
      <button type="button" onClick={() => download(toAse(namedColors(colors)), 'application/octet-stream', 'ase')}><strong>Swatch file (.ase)</strong><small>For Adobe apps, Procreate, Affinity</small></button>
    </div>
    {copied && <p role="status" className="hint">{copied}</p>}
    <label>The hex codes<textarea rows={4} readOnly value={toHexList(colors)} onFocus={event => event.currentTarget.select()} /></label>
    <div className="actions"><button type="button" onClick={onClose}>Close</button></div>
  </Popup>;
}

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { FullTheme } from '@party/contracts';
import { translate } from '../../i18n/texts.js';
import { LOOK_TEXTS } from './look.text.js';
const t = (key: keyof typeof LOOK_TEXTS.en, values?: Record<string, string | number>) => translate(LOOK_TEXTS, key, values);
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
    if (file.size > 1_000_000) { setError(t('fileTooLarge')); return; }
    parsePaletteFile(file).then(found => { setFromFile({ name: file.name, colors: found }); if (!found.length) setError(t('noneInFile', { name: file.name })); }, () => setError(t('unreadable')));
  };
  return <Popup title={t('importTitle')} onClose={onClose}>
    <p>{t('importIntro')}</p>
    <label>{t('colours')}<textarea rows={4} value={text} placeholder={'#009ee2 #f39200 #7ac6b6\nor https://coolors.co/009ee2-f39200-7ac6b6'} onChange={event => { setText(event.target.value); setFromFile(null); setError(''); }} /></label>
    <label className="palette-file">{t('orFile')}<input type="file" accept=".ase,.gpl,.json,.css,.txt,.svg,text/plain,application/json" onChange={event => choose(event.target.files?.[0])} /></label>
    {error ? <p role="alert" className="hint warn">{error}</p>
      : <p role="status" className="palette-found">{colors.length ? <>{`${t(colors.length === 1 ? 'foundOne' : 'foundMany', { count: colors.length })}${fromFile ? t('inFile', { name: fromFile.name }) : ''}`}<Swatches colors={colors} /></> : t('noneYet')}</p>}
    {colors.length > 8 && <p className="hint">{t('first8')}</p>}
    <p className="hint">{t('becomeHint')}</p>
    <div className="actions"><button type="button" onClick={onClose}>{t('cancel')}</button><button type="button" className="accent" disabled={!colors.length} onClick={() => { onApply(applyPalette(colors)); onClose(); }}>{t('useColours')}</button></div>
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
  const copy = () => navigator.clipboard.writeText(toHexList(colors)).then(() => setCopied(t('copiedPaste')), () => setCopied(t('copyFailed')));
  return <Popup title={t('exportTitle')} onClose={onClose}>
    <Swatches colors={namedColors(colors).map(color => color.hex)} />
    <div className="palette-exports">
      <button type="button" onClick={copy}><strong>{t('copyHex')}</strong><small>{t('copyHexFor')}</small></button>
      <button type="button" onClick={() => download(toTokens(colors, title), 'application/json', 'json')}><strong>{t('tokens')}</strong><small>{t('tokensFor')}</small></button>
      <button type="button" onClick={() => download(toAse(namedColors(colors)), 'application/octet-stream', 'ase')}><strong>{t('ase')}</strong><small>{t('aseFor')}</small></button>
    </div>
    {copied && <p role="status" className="hint">{copied}</p>}
    <label>{t('hexCodes')}<textarea rows={4} readOnly value={toHexList(colors)} onFocus={event => event.currentTarget.select()} /></label>
    <div className="actions"><button type="button" onClick={onClose}>{t('close')}</button></div>
  </Popup>;
}

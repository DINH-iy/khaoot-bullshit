import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { BRICK_COLUMNS, BRICK_ROWS, BRICK_PRESETS, BRICK_SPLIT_TILE, BRICK_TOUGHNESS, BRICK_WIDE_TILE, BrickMapSchema, brickMap, brickTileHits, type BrickSettings } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { BRICK_TEXTS } from './brick-rally.text.js';
import './brick-rally.css';

const TILES = { '#': 'brick', '+': 'strong', [BRICK_SPLIT_TILE]: 'split', [BRICK_WIDE_TILE]: 'wide', '.': 'clear' } as const;
type Tile = keyof typeof TILES;
type Cell = { row: number; column: number };

export function BrickMapFields({ settings, disabled = false, onChange }: { settings: BrickSettings; disabled?: boolean; onChange: (settings: BrickSettings) => void }) {
  const t = useTexts(BRICK_TEXTS);
  const [editing, setEditing] = useState(false);
  return <fieldset className="brick-settings" disabled={disabled}>
    <legend>{t('map')}</legend>
    <div className="actions">
      {BRICK_PRESETS.map(preset => <button type="button" key={preset} aria-pressed={!settings.map && (settings.preset ?? 'steps') === preset}
        onClick={() => onChange({ ...settings, preset, map: undefined })}>{t(preset)}</button>)}
      <button type="button" aria-haspopup="dialog" onClick={() => setEditing(true)}>{t('edit')}</button>
    </div>
    {settings.map && <p>{t('custom')}</p>}
    {editing && !disabled && <BrickMapEditor map={brickMap(settings)} onClose={() => setEditing(false)} onApply={map => {
      onChange({ ...settings, preset: undefined, map });
      setEditing(false);
    }} />}
  </fieldset>;
}

function BrickMapEditor({ map, onClose, onApply }: { map: readonly string[]; onClose: () => void; onApply: (map: string[]) => void }) {
  const t = useTexts(BRICK_TEXTS);
  const title = useId();
  const instructions = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const stroke = useRef<{ pointerId: number; last: Cell | undefined } | undefined>(undefined);
  const [rows, setRows] = useState(() => [...map]);
  const [brush, setBrush] = useState<Tile>('#');
  const [toughness, setToughness] = useState<number>(2);
  const paintValue = brush === '+' && toughness > 2 ? String(toughness) : brush;
  const [focus, setFocus] = useState(0);
  const columns = rows[0]!.length;
  const valid = BrickMapSchema.safeParse(rows).success;

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const paint = (from: Cell, to: Cell) => {
    const steps = Math.max(Math.abs(to.row - from.row), Math.abs(to.column - from.column));
    setRows(current => {
      const next = [...current];
      for (let step = 0; step <= steps; step++) {
        const progress = steps ? step / steps : 0;
        const row = Math.round(from.row + (to.row - from.row) * progress);
        const column = Math.round(from.column + (to.column - from.column) * progress);
        const line = next[row]!;
        if (line[column] !== paintValue) next[row] = line.slice(0, column) + paintValue + line.slice(column + 1);
      }
      return next;
    });
  };
  const cellAt = (event: PointerEvent<HTMLDivElement>): Cell | undefined => {
    const box = event.currentTarget.getBoundingClientRect();
    const column = Math.floor((event.clientX - box.left) * columns / box.width);
    const row = Math.floor((event.clientY - box.top) * rows.length / box.height);
    if (row < 0 || row >= rows.length || column < 0 || column >= columns) return undefined;
    return { row, column };
  };

  return <dialog className="brick-map-editor" ref={dialog} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
    <header><h2 id={title}>{t('edit')}</h2></header>
    <div className="brick-map-content">
      <div className="brick-map-toolbar">
        <div className="brick-brushes" role="group" aria-label={t('brush')}>
          {(Object.keys(TILES) as Tile[]).map(tile => {
            const tool = <button key={tile} type="button" aria-pressed={brush === tile} onClick={() => setBrush(tile)}>
              <span className="brick-swatch" data-tile={tile} aria-hidden="true" />{t(TILES[tile])}
            </button>;
            if (tile !== '+') return tool;
            return <div className="brick-toughness" key={tile}>
              {tool}
              <select aria-label={t('hitsToBreak')} value={toughness} onChange={event => {
                setToughness(Number(event.currentTarget.value));
                setBrush('+');
              }}>{BRICK_TOUGHNESS.map(hits => <option key={hits} value={hits}>{t('hits', { hits })}</option>)}</select>
            </div>;
          })}
        </div>
        <button type="button" onClick={() => { setFocus(0); setRows(Array.from({ length: BRICK_ROWS }, () => '.'.repeat(BRICK_COLUMNS))); }}>{t('blank')}</button>
      </div>
      <p id={instructions} className="brick-map-hint">{t('paintHint')}</p>
      <div className="brick-map-canvas">
        <div className="brick-grid" role="group" aria-label={t('map')} aria-describedby={instructions}
          style={{ '--brick-columns': columns, '--brick-rows': rows.length } as CSSProperties}
          onPointerDown={event => {
            if (event.button !== 0 || stroke.current) return;
            const cell = cellAt(event);
            if (!cell) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            stroke.current = { pointerId: event.pointerId, last: cell };
            setFocus(cell.row * columns + cell.column);
            paint(cell, cell);
          }}
          onPointerMove={event => {
            const active = stroke.current;
            if (event.pointerId !== active?.pointerId) return;
            const cell = cellAt(event);
            if (cell && (active.last?.row !== cell.row || active.last.column !== cell.column)) paint(active.last ?? cell, cell);
            active.last = cell;
          }}
          onLostPointerCapture={event => { if (event.pointerId === stroke.current?.pointerId) stroke.current = undefined; }}>
          {rows.flatMap((line, row) => [...line].map((tile, column) => {
            const index = row * columns + column;
            const hits = brickTileHits(tile);
            const tileName = hits > 1 ? t('strongHits', { hits }) : t(TILES[tile as Tile]);
            return <button type="button" key={index} tabIndex={index === focus ? 0 : -1}
              className="brick-tile" data-tile={hits > 1 ? '+' : tile} aria-label={t('cell', { row: row + 1, column: column + 1, tile: tileName })}
              onFocus={() => setFocus(index)} onClick={event => { if (event.detail === 0) paint({ row, column }, { row, column }); }}
              onKeyDown={event => {
                const next = { ArrowLeft: [row, column - 1], ArrowRight: [row, column + 1], ArrowUp: [row - 1, column], ArrowDown: [row + 1, column] }[event.key];
                if (!next) return;
                event.preventDefault();
                const [nextRow, nextColumn] = next as [number, number];
                if (nextRow < 0 || nextRow >= rows.length || nextColumn < 0 || nextColumn >= columns) return;
                const button = event.currentTarget.parentElement?.children.item(nextRow * columns + nextColumn) as HTMLButtonElement | null;
                button?.focus();
              }}>{hits > 2 ? hits : null}</button>;
          }))}
        </div>
      </div>
    </div>
    <footer>
      <p className="brick-map-hint" role="status">{!valid && t('empty')}</p>
      <div className="brick-map-actions">
        <button type="button" onClick={onClose}>{t('cancel')}</button>
        <button type="button" className="brick-map-apply" disabled={!valid} onClick={() => onApply(rows)}>{t('apply')}</button>
      </div>
    </footer>
  </dialog>;
}

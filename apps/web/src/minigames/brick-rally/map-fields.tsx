import { useState, type CSSProperties } from 'react';
import { BRICK_COLUMNS, BRICK_ROWS, BRICK_PRESETS, BrickMapSchema, brickMap, type BrickSettings } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { BRICK_TEXTS } from './brick-rally.text.js';
import './brick-rally.css';

const TILES = { '.': 'clear', '#': 'brick', '+': 'strong' } as const;
type Tile = keyof typeof TILES;

export function BrickMapFields({ settings, disabled = false, onChange }: { settings: BrickSettings; disabled?: boolean; onChange: (settings: BrickSettings) => void }) {
  const t = useTexts(BRICK_TEXTS);
  const [rows, setRows] = useState<string[]>();
  const [brush, setBrush] = useState<Tile>('#');
  const [focusedTile, setFocusedTile] = useState(0);
  const paintTile = (row: number, column: number) => {
    setRows(current => current?.map((line, index) => index === row ? line.slice(0, column) + brush + line.slice(column + 1) : line));
  };
  const valid = Boolean(rows && BrickMapSchema.safeParse(rows).success);
  return <fieldset className="brick-settings" disabled={disabled}>
    <legend>{t('map')}</legend>
    <div className="actions">
      {BRICK_PRESETS.map(preset => <button type="button" key={preset} aria-pressed={!settings.map && (settings.preset ?? 'steps') === preset}
        onClick={() => { setRows(undefined); onChange({ preset }); }}>{t(preset)}</button>)}
      <button type="button" aria-expanded={Boolean(rows)} onClick={() => { setFocusedTile(0); setRows(rows ? undefined : [...brickMap(settings)]); }}>{t('edit')}</button>
    </div>
    {settings.map && !rows && <p>{t('custom')}</p>}
    {rows && <>
      <div className="actions" role="group" aria-label={t('brush')}>
        {(Object.keys(TILES) as Tile[]).map(tile => <button type="button" key={tile} aria-pressed={brush === tile} onClick={() => setBrush(tile)}>{t(TILES[tile])}</button>)}
      </div>
      <div className="brick-grid-scroll">
        <div className="brick-grid" style={{ '--brick-columns': rows[0]?.length } as CSSProperties}>
          {rows.flatMap((line, row) => [...line].map((tile, column) => {
            const index = row * line.length + column;
            return <button type="button" key={index} tabIndex={index === focusedTile ? 0 : -1}
              className="brick-tile" data-tile={tile} aria-label={t('cell', { row: row + 1, column: column + 1, tile: t(TILES[tile as Tile]) })}
              onFocus={() => setFocusedTile(index)} onClick={() => paintTile(row, column)}
              onPointerEnter={event => { if (event.pointerType === 'mouse' && event.buttons === 1) paintTile(row, column); }}
              onKeyDown={event => {
                const arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -line.length, ArrowDown: line.length };
                if (!(event.key in arrows)) return;
                event.preventDefault();
                const next = index + arrows[event.key as keyof typeof arrows];
                const button = event.currentTarget.parentElement?.children.item(next) as HTMLButtonElement | null;
                button?.focus();
              }}>{tile === '+' ? '2' : tile === '#' ? '1' : ''}</button>;
          }))}
        </div>
      </div>
      {!valid && <p role="status">{t('empty')}</p>}
      <div className="actions">
        <button type="button" disabled={!valid} onClick={() => { onChange({ map: rows }); setRows(undefined); }}>{t('apply')}</button>
        <button type="button" onClick={() => { setFocusedTile(0); setRows(Array.from({ length: BRICK_ROWS }, () => '.'.repeat(BRICK_COLUMNS))); }}>{t('blank')}</button>
        <button type="button" onClick={() => setRows(undefined)}>{t('cancel')}</button>
      </div>
    </>}
  </fieldset>;
}

import { placePoints, PlacesSchema, type Places } from '@party/contracts';
import { Segmented } from '../../controls/segmented.js';

const toPoints = (milli: string) => String(Number(milli) / 1000);
const toMilli = (text: string) => { const value = Math.round(Number(text)); return Number.isFinite(value) && value >= 0 ? String(Math.min(value, 999_999_999) * 1000) : '0'; };
export const ordinal = (place: number) => ['1st', '2nd', '3rd'][place - 1] ?? `${place}th`;
const CURVES = [{ value: 'even', label: 'Even steps', hint: 'Like 3, 2, 1' }, { value: 'steep', label: 'Winner takes most', hint: 'Like 4, 2, 1' }, { value: 'equal', label: 'The same for every place' }] as const;

/**
 * Points by place, the same everywhere: off (when allowed), a number of points for
 * each place, or a total the server splits over a number of places. Shows what
 * each place gets, worked out exactly as the server will.
 */
export function PlacesFields({ legend, hint, value, onChange, required = false, fallback = ['10000', '6000', '3000'] }: {
  legend: string; hint: string; value: Places | undefined; onChange: (next: Places | undefined) => void; required?: boolean; fallback?: string[];
}) {
  const mode = value?.kind ?? 'none';
  const list = value?.kind === 'list' ? value.pointsMilli : null;
  const parsed = value ? PlacesSchema.safeParse(value) : null;
  const preview = parsed?.success ? placePoints(parsed.data) : null;
  const setMode = (next: string) => onChange(next === 'none' ? undefined
    : next === 'list' ? { kind: 'list', pointsMilli: preview ?? fallback }
    : { kind: 'split', totalMilli: String(preview ? preview.reduce((sum, entry) => sum + Number(entry), 0) : 30_000), places: preview?.length ?? 3, curve: 'even' });
  return <fieldset className="places-fields"><legend>{legend}</legend>
    <p className="hint">{hint} A tie shares the place, and each gets its points.</p>
    <Segmented label="Points are given as" stacked value={mode} onChange={setMode}
      choices={[...(required ? [] : [{ value: 'none', label: 'None' }]), { value: 'list', label: 'Points for each place' }, { value: 'split', label: 'A total, split over the places' }]} />
    {list && <>
      <div className="place-list">{list.map((amount, position) => <div key={position} className="place-row"><label className="ed-inline">{ordinal(position + 1)} place<span className="ed-unit"><input type="number" min={0} value={toPoints(amount)}
        onChange={event => onChange({ kind: 'list', pointsMilli: list.map((entry, at) => at === position ? toMilli(event.target.value) : entry) })} />pts</span></label>
        <button className="icon-button" disabled={list.length <= 1} aria-label={`Remove ${ordinal(position + 1)} place`} onClick={() => onChange({ kind: 'list', pointsMilli: list.filter((_, at) => at !== position) })}>×</button></div>)}</div>
      <button className="small-button" disabled={list.length >= 12} onClick={() => onChange({ kind: 'list', pointsMilli: [...list, '0'] })}>+ Place</button>
    </>}
    {value?.kind === 'split' && <>
      <label className="ed-inline">Points in total<span className="ed-unit"><input type="number" min={0} value={toPoints(value.totalMilli)} onChange={event => onChange({ ...value, totalMilli: toMilli(event.target.value) })} />pts</span></label>
      <label className="ed-inline">Number of places<input type="number" min={1} max={12} value={value.places} onChange={event => onChange({ ...value, places: Math.max(1, Math.min(12, Math.round(Number(event.target.value) || 1))) })} /></label>
      <Segmented label="How it is split" stacked value={value.curve} choices={CURVES} onChange={curve => onChange({ ...value, curve })} />
    </>}
    {preview && value?.kind === 'split' && <p className="places-preview" aria-live="polite">{preview.map((amount, index) => `${ordinal(index + 1)}: ${toPoints(amount)}`).join(' · ')}</p>}
  </fieldset>;
}

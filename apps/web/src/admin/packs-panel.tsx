import { useEffect, useState } from 'react';
import { PackAdminSchema, RARITY_KEYS, RARITY_NAMES, type Chances, type Economy, type PackAdmin, type PackItemView, type PackSetAdmin, type RarityKey } from '@party/contracts';
import { roomApi } from '../room/api.js';
import { SIGNED_OUT_TEXT } from '../owner/owner-session.js';
import { Icon } from '../editor/controls/icons.js';

/**
 * Admin → Chips & packs: the chip amounts (start, what playing earns) and the pack sets players buy with them,
 * each with its price, chances, god pack odds and items. Every save answers with the whole page as stored.
 * Removing a set or an item never takes it from anyone's collection; it is just no longer in packs.
 */
export function PacksPanel() {
  const [data, setData] = useState<PackAdmin>(); const [error, setError] = useState(''); const [saved, setSaved] = useState('');
  const load = () => roomApi('/api/host/packs').then(reply => setData(PackAdminSchema.parse(reply))).catch((cause: unknown) => setError(problem(cause)));
  useEffect(() => { void load(); }, []);
  const send = async (path: string, body: unknown, done: string) => {
    setError(''); setSaved('');
    try { setData(PackAdminSchema.parse(await roomApi(`/api/host/packs${path}`, body))); setSaved(done); return true; } catch (cause) { setError(problem(cause)); return false; }
  };
  if (!data) return error ? <p role="alert" className="error">{error}</p> : <p role="status">Loading…</p>;
  return <div className="packs-admin">
    <p className="admin-intro">Players earn chips by playing in rooms with chips on, and spend them on packs. Changes count from the next pack or game.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {saved && <p role="status" className="packs-saved"><Icon name="check" size={16} /> {saved}</p>}
    <EconomyCard key={JSON.stringify(data.economy)} economy={data.economy} onSave={economy => void send('/economy', economy, 'Chip amounts saved.')} />
    <div className="packs-sets-head"><h2>Pack sets</h2>
      <button type="button" className="primary" onClick={() => void send('/sets', { name: 'New set', price: 100, onSale: false, chances: { common: 70, rare: 22, epic: 7, legendary: 1 }, godPackOdds: 500 }, 'Set added (not on sale yet).')}><Icon name="plus" size={18} /> New set</button></div>
    {data.sets.length === 0 && <p className="admin-empty">No pack sets yet.</p>}
    {data.sets.map(set => <SetCard key={set.id} set={set} send={send} />)}
  </div>;
}

const problem = (cause: unknown) => cause instanceof Error && cause.message === 'UNAUTHORIZED' ? SIGNED_OUT_TEXT : 'That did not work. Check the values and try again.';
const toNumber = (text: string) => { const value = Number(text); return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0; };
function NumberField({ label, value, onChange, hint }: { label: string; value: number; onChange: (value: number) => void; hint?: string }) {
  return <label className="packs-field"><span>{label}</span><input type="number" inputMode="numeric" min={0} value={value} onChange={event => onChange(toNumber(event.target.value))} />{hint && <small>{hint}</small>}</label>;
}

function EconomyCard({ economy, onSave }: { economy: Economy; onSave: (economy: Economy) => void }) {
  const [draft, setDraft] = useState(economy);
  const earn = (patch: Partial<Economy['earn']>) => setDraft({ ...draft, earn: { ...draft.earn, ...patch } });
  const place = (index: number, value: number) => earn({ place: draft.earn.place.map((old, at) => at === index ? value : old) as Economy['earn']['place'] });
  const changed = JSON.stringify(draft) !== JSON.stringify(economy);
  // Short labels, no hints underneath, so every field lines up; Save sits in the grid as its last cell.
  return <section className="person-card packs-card" aria-labelledby="chips-heading"><h3 id="chips-heading">Chips</h3>
    <div className="packs-grid packs-economy">
      <NumberField label="🪙 To start" value={draft.startChips} onChange={startChips => setDraft({ ...draft, startChips })} />
      <NumberField label="⭐ Per point" value={draft.earn.perPoint} onChange={perPoint => earn({ perPoint })} />
      <NumberField label="🥇 1st place" value={draft.earn.place[0]} onChange={value => place(0, value)} />
      <NumberField label="🥈 2nd place" value={draft.earn.place[1]} onChange={value => place(1, value)} />
      <NumberField label="🥉 3rd place" value={draft.earn.place[2]} onChange={value => place(2, value)} />
      <NumberField label="🙂 Everyone else" value={draft.earn.played} onChange={played => earn({ played })} />
      <NumberField label="🎮 Minigame won" value={draft.earn.roundWin} onChange={roundWin => earn({ roundWin })} />
      <NumberField label="🕹️ Arcade win" value={draft.earn.arcadeWin} onChange={arcadeWin => earn({ arcadeWin })} />
      <div className="packs-economy-save">{changed && <button type="button" className="icon-only" aria-label="Undo changes" title="Undo changes" onClick={() => setDraft(economy)}><Icon name="undo" size={18} /></button>}
        <button type="button" className="primary" disabled={!changed} onClick={() => onSave(draft)}><Icon name="check" size={18} /> Save</button></div>
    </div>
  </section>;
}

type Send = (path: string, body: unknown, done: string) => Promise<boolean>;
/** A set as one slim row (name, price, items, on sale, edit, remove); Edit unfolds its settings and items. */
function SetCard({ set, send }: { set: PackSetAdmin; send: Send }) {
  const stored = { name: set.name, price: set.price, chances: set.chances, godPackOdds: set.godPackOdds };
  const [draft, setDraft] = useState(stored); const [removing, setRemoving] = useState(false); const [editing, setEditing] = useState(set.items.length === 0);
  const total = RARITY_KEYS.reduce((sum, key) => sum + draft.chances[key], 0);
  const changed = JSON.stringify(draft) !== JSON.stringify(stored);
  const chance = (key: RarityKey, value: number) => setDraft({ ...draft, chances: { ...draft.chances, [key]: Math.min(100, value) } as Chances });
  const missing = RARITY_KEYS.filter(key => draft.chances[key] > 0 && !set.items.some(item => item.rarity === key));
  const toggleSale = () => void send(`/sets/${set.id}`, { ...stored, onSale: !set.onSale }, set.onSale ? `${set.name} is hidden.` : `${set.name} is on sale.`);
  return <section className={`person-card packs-set${editing ? ' editing' : ''}`} aria-label={set.name}>
    <div className="packs-set-row">
      <button type="button" className="packs-set-title" aria-expanded={editing} onClick={() => setEditing(!editing)}>
        <strong>{set.name}</strong><span className={`packs-badge${set.onSale ? ' on' : ''}`}>{set.onSale ? 'On sale' : 'Hidden'}</span><small>🪙 {set.price} · {set.items.length} items</small></button>
      {removing ? <span className="packs-set-quick"><span>Remove? Collections keep their items.</span>
        <button type="button" onClick={() => setRemoving(false)}>Keep</button>
        <button type="button" className="danger" onClick={() => void send(`/sets/${set.id}/delete`, {}, `${set.name} removed.`)}>Remove</button></span>
        : <span className="packs-set-quick">
          {/* A toggle button: filled while the set is on sale, outlined while it is hidden. */}
          <button type="button" className={`icon-only packs-sale${set.onSale ? ' on' : ''}`} aria-pressed={set.onSale} aria-label={`${set.name} on sale`} title={set.onSale ? 'On sale: click to hide' : 'Hidden: click to put on sale'} onClick={toggleSale}><Icon name="eye" size={18} /></button>
          <button type="button" className="icon-only" aria-label={`Edit ${set.name}`} aria-expanded={editing} title={editing ? 'Close' : 'Edit'} onClick={() => setEditing(!editing)}><Icon name="edit" size={18} /></button>
          <button type="button" className="danger icon-only" aria-label={`Remove ${set.name}`} title="Remove this set" onClick={() => setRemoving(true)}><Icon name="trash" size={18} /></button>
        </span>}
    </div>
    {editing && <div className="packs-set-body">
      <div className="packs-set-settings">
        <label className="packs-field packs-name"><span>Name</span><input value={draft.name} maxLength={60} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <NumberField label="🪙 Price" value={draft.price} onChange={price => setDraft({ ...draft, price })} />
        <NumberField label="✨ God pack 1 in (0 = never)" value={draft.godPackOdds} onChange={godPackOdds => setDraft({ ...draft, godPackOdds })} />
        {RARITY_KEYS.map(key => <NumberField key={key} label={`${RARITY_NAMES[key]} %`} value={draft.chances[key]} onChange={value => chance(key, value)} />)}
      </div>
      <div className="packs-set-save">
        <p className={`packs-total${total === 100 ? '' : ' bad'}`} aria-live="polite">{total === 100 ? 'Chances add up to 100%' : `Chances add up to ${total}%, need 100%`}</p>
        {changed && <button type="button" className="icon-only" aria-label="Undo changes" title="Undo changes" onClick={() => setDraft(stored)}><Icon name="undo" size={18} /></button>}
        <button type="button" className="primary" disabled={!changed || total !== 100 || !draft.name.trim()} onClick={() => void send(`/sets/${set.id}`, { ...draft, onSale: set.onSale }, `${draft.name} saved.`)}><Icon name="check" size={18} /> Save</button>
      </div>
      {missing.length > 0 && <p className="packs-warning">No {missing.map(key => RARITY_NAMES[key].toLowerCase()).join(' or ')} items yet: those draws give the nearest rarity instead.</p>}
      <ul className="packs-items" aria-label={`Items in ${set.name}`}>
        {set.items.map(item => <ItemRow key={`${item.key}-${item.name}-${item.emoji}-${item.rarity}-${item.flavor}`} item={item} onSave={input => send(`/items/${item.key}`, input, `${input.name} saved.`)}
          onRemove={() => void send(`/items/${item.key}/delete`, {}, `${item.name} removed from packs.`)} />)}
        <ItemRow key={`new-${set.items.length}`} onSave={input => send(`/sets/${set.id}/items`, input, `${input.name} added.`)} />
      </ul>
    </div>}
  </section>;
}

type ItemInput = { name: string; emoji: string; rarity: RarityKey; flavor: string };
/** One item, edited in place; without `item` it is the empty row that adds one. */
function ItemRow({ item, onSave, onRemove }: { item?: PackItemView; onSave: (input: ItemInput) => Promise<boolean>; onRemove?: () => void }) {
  const stored: ItemInput = item ? { name: item.name, emoji: item.emoji, rarity: item.rarity, flavor: item.flavor } : { name: '', emoji: '', rarity: 'common', flavor: '' };
  const [draft, setDraft] = useState(stored);
  const changed = JSON.stringify(draft) !== JSON.stringify(stored);
  const label = item ? item.name : 'new item';
  return <li className={`packs-item rarity-${draft.rarity}${item ? '' : ' new'}`}>
    <input className="packs-emoji" aria-label={`Emoji of ${label}`} placeholder="🙂" value={draft.emoji} maxLength={16} onChange={event => setDraft({ ...draft, emoji: event.target.value })} />
    <input aria-label={`Name of ${label}`} placeholder={item ? 'Name' : 'New item name'} value={draft.name} maxLength={40} onChange={event => setDraft({ ...draft, name: event.target.value })} />
    <select aria-label={`Rarity of ${label}`} value={draft.rarity} onChange={event => setDraft({ ...draft, rarity: event.target.value as RarityKey })}>{RARITY_KEYS.map(key => <option key={key} value={key}>{RARITY_NAMES[key]}</option>)}</select>
    <input aria-label={`Line on the card of ${label}`} placeholder="A line on the card" value={draft.flavor} maxLength={120} onChange={event => setDraft({ ...draft, flavor: event.target.value })} />
    <span className="packs-item-actions">
      {/* An item's save button shows only once it is changed; the empty row always has its add button. */}
      {(!item || changed) && <button type="button" className="primary icon-only" disabled={!changed || !draft.name.trim()} aria-label={item ? `Save ${label}` : 'Add this item'} title={item ? 'Save' : 'Add'}
        onClick={() => void onSave(draft)}><Icon name={item ? 'check' : 'plus'} size={18} /></button>}
      {onRemove && <button type="button" className="danger icon-only" aria-label={`Remove ${label} from packs`} title="Remove from packs (collections keep it)" onClick={onRemove}><Icon name="trash" size={18} /></button>}
    </span>
  </li>;
}

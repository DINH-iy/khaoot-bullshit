import { useState } from 'react';
import { PACK_ITEMS, PACK_PRICE, PackResultSchema, RARITIES, type PackResult } from '@party/contracts';
import { newId } from '../network/api.js';
import { chips, sideApi, sideProblem } from './side-api.js';

const item = (key: string) => PACK_ITEMS.find(entry => entry.key === key);
const rarityName = (key: string) => RARITIES.find(rarity => rarity.key === key)?.name ?? key;

/** Packs: pay chips, get four items by rarity; collect them all. */
export function Packs({ sessionId, balance, onBalance, collection, onCollected }: {
  sessionId: string; balance: number; onBalance: (balance: number) => void; collection: Map<string, number>; onCollected: (items: string[]) => void;
}) {
  const [opened, setOpened] = useState<PackResult>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const open = async () => {
    setBusy(true); setError('');
    try { const result = PackResultSchema.parse(await sideApi(sessionId, '/packs', { roundId: newId() })); setOpened(result); onBalance(result.balance); onCollected(result.items); }
    catch (cause) { setError(sideProblem(cause)); } finally { setBusy(false); }
  };
  const owned = PACK_ITEMS.filter(entry => collection.has(entry.key)).length;
  return <div className="side-game packs">
    {opened && <ul className="pack-reveal" aria-label="In this pack">{opened.items.map((key, index) => { const found = item(key); return <li key={`${opened.roundId}-${index}`} className={`rarity-${found?.rarity ?? 'common'}`} style={{ animationDelay: `${index * 180}ms` }}>
      <span aria-hidden="true">{found?.emoji}</span><strong>{found?.name ?? key}</strong><small>{rarityName(found?.rarity ?? '')}</small></li>; })}</ul>}
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="primary big" disabled={busy || balance < PACK_PRICE} onClick={() => void open()}>{busy ? 'Opening…' : `Open a pack for ${chips(PACK_PRICE)}`}</button>
    <details className="odds"><summary>Chances per item</summary>
      <ul>{RARITIES.map(rarity => <li key={rarity.key}>{rarity.name}: {rarity.percent}%</li>)}</ul>
    </details>
    <h3 className="side-subhead">Your collection · {owned} of {PACK_ITEMS.length}</h3>
    <ul className="collection">{PACK_ITEMS.map(entry => { const count = collection.get(entry.key) ?? 0; return <li key={entry.key} className={`rarity-${entry.rarity}${count ? '' : ' missing'}`}>
      <span aria-hidden="true">{count ? entry.emoji : '❔'}</span><small>{count ? `${entry.name}${count > 1 ? ` ×${count}` : ''}` : rarityName(entry.rarity)}</small></li>; })}</ul>
  </div>;
}

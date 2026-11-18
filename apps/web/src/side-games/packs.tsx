import { useEffect, useRef, useState } from 'react';
import { packPrice, PackResultSchema, RARITY_KEYS, RARITY_NAMES, type PackItemView, type PackResult, type PackSetView, type RarityKey } from '@party/contracts';
import { newId } from '../room/api.js';
import { chips, sideApi, sideProblem } from './side-api.js';
import { FaIcon } from '../presentation/icons.js';

const rarityName = (key: string) => RARITY_NAMES[key as RarityKey] ?? key;
const rankOf = (found: PackItemView | undefined) => RARITY_KEYS.indexOf(found?.rarity ?? 'common');
type Lookup = (key: string) => PackItemView | undefined;
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Opening a pack, like a pack of trading cards: the sealed foil pack (tap to tear it open), then the cards
 * one by one, the best last (tap for the next; "Show all" skips), and the four together at the end. The
 * server has already decided what is inside; this only shows it. With reduced motion the cards show at once.
 */
type Opening = { result: PackResult; set: PackSetView; order: string[]; phase: 'sealed' | 'tearing' | 'revealing' | 'done'; shown: number };

/**
 * Packs: bought with chips (only in rooms with chips), four items by rarity; collect them all. The owner makes
 * the pack sets (Admin → Chips & packs), each with its own price, chances and items; the player picks one.
 */
export function Packs({ sessionId, balance, onBalance, collection, onCollected, sets, otherItems }: {
  sessionId: string; balance: number; onBalance: (balance: number) => void; collection: Map<string, number>; onCollected: (items: string[]) => void;
  sets: PackSetView[]; otherItems: PackItemView[];
}) {
  const [opening, setOpening] = useState<Opening>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [chosenId, setChosenId] = useState(sets[0]?.id); const chosen = sets.find(set => set.id === chosenId) ?? sets[0];
  const all = [...sets.flatMap(set => set.items), ...otherItems]; const item: Lookup = key => all.find(entry => entry.key === key);
  // The collection below learns the new items once they are shown (not before: that would give the pack away),
  // or when the panel closes halfway.
  const pending = useRef<string[] | null>(null);
  const collect = () => { if (pending.current) { onCollected(pending.current); pending.current = null; } };
  useEffect(() => () => collect(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = async () => {
    if (!chosen) return;
    collect(); setBusy(true); setError(''); const set = chosen;
    try {
      const result = PackResultSchema.parse(await sideApi(sessionId, '/packs', { roundId: newId(), setId: set.id })); onBalance(result.balance);
      pending.current = result.items;
      // The best card last; equal ones keep the pack's order.
      const order = result.items.map((key, index) => ({ key, index })).sort((a, b) => rankOf(item(a.key)) - rankOf(item(b.key)) || a.index - b.index).map(entry => entry.key);
      if (reducedMotion()) { setOpening({ result, set, order, phase: 'done', shown: order.length }); collect(); }
      else setOpening({ result, set, order, phase: 'sealed', shown: 0 });
    } catch (cause) { setError(sideProblem(cause)); } finally { setBusy(false); }
  };
  const tear = () => {
    if (!opening || opening.phase !== 'sealed') return;
    setOpening({ ...opening, phase: 'tearing' });
    setTimeout(() => setOpening(current => current && current.phase === 'tearing' ? { ...current, phase: 'revealing' } : current), 650);
  };
  const next = () => {
    if (!opening) return;
    if (opening.shown >= opening.order.length) { setOpening({ ...opening, phase: 'done' }); collect(); return; }
    setOpening({ ...opening, shown: opening.shown + 1 });
  };
  const showAll = () => { if (opening) { setOpening({ ...opening, phase: 'done', shown: opening.order.length }); collect(); } };
  const phase = opening?.phase;
  if (!chosen) return <div className="side-game packs"><p className="pack-hint">No packs on sale right now.</p></div>;
  const owned = chosen.items.filter(entry => collection.has(entry.key)).length;
  const others = otherItems.filter(entry => collection.has(entry.key));
  const price = packPrice(chosen);
  return <div className="side-game packs">
    {/* Which set to open: only before opening or once a pack is done, so a pack is never swapped halfway. */}
    {sets.length > 1 && (!opening || phase === 'done') && <div className="pack-sets" role="radiogroup" aria-label="Pack set">
      {sets.map(set => <button key={set.id} type="button" role="radio" aria-checked={set.id === chosen.id} className={`pack-set${set.id === chosen.id ? ' chosen' : ''}`} onClick={() => setChosenId(set.id)}>
        <strong>{set.name}</strong>{set.sale && <span className="pack-set-sale">{set.sale}% off</span>}<small>🪙 {set.sale ? <><s>{set.price.toLocaleString()}</s> {packPrice(set).toLocaleString()}</> : set.price.toLocaleString()} · {set.items.filter(entry => collection.has(entry.key)).length}/{set.items.length}</small></button>)}
    </div>}
    {opening && (phase === 'sealed' || phase === 'tearing') && <div className="pack-stage">
      <button type="button" className={`foil-pack${phase === 'tearing' ? ' tearing' : ''}`} onClick={tear} aria-label="Tear the pack open">
        <span className="foil-top" aria-hidden="true" /><span className="foil-body" aria-hidden="true"><span className="foil-shine" /><strong>{opening.set.name}</strong><small>{opening.order.length} items</small></span>
      </button>
      <p className="pack-hint" aria-hidden="true">Tap the pack to open it</p>
    </div>}
    {opening && phase === 'revealing' && <RevealStack opening={opening} item={item} onNext={next} onShowAll={showAll} />}
    {/* A god pack shows itself only at the end, once every card is turned over. */}
    {opening && phase === 'done' && opening.result.god && <><p className="god-pack-banner" role="status">God pack!<small>Only epic and legendary items</small></p>
      <span className="pack-confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, index) => <i key={index} style={{ left: `${(index * 29) % 100}%`, animationDelay: `${(index % 9) * 80}ms`, background: ['#ffcf4a', '#ff5fa2', '#7ce0ff', '#c77dff', '#fff'][index % 5] }} />)}</span></>}
    {opening && phase === 'done' && <ul className="pack-reveal" aria-label="In this pack">{opening.order.map((key, index) => { const found = item(key); return <li key={`${opening.result.roundId}-${index}`} className={`rarity-${found?.rarity ?? 'common'}`} style={{ animationDelay: `${index * 90}ms` }}>
      <span aria-hidden="true"><ItemArt item={found} /></span><strong>{found?.name ?? key}</strong><small>{rarityName(found?.rarity ?? '')}</small></li>; })}</ul>}
    {opening && phase === 'done' && balance < price && <p className="pack-hint">Win chips in the games to open the next pack.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {(!opening || phase === 'done') && <button type="button" className="primary big" disabled={busy || balance < price} onClick={() => void open()}>{busy ? 'Opening…' : `${opening ? 'Open another pack' : 'Open a pack'} for ${chips(price)}`}</button>}
    {/* The collection and the chances fold away, so the pack stays the main thing. Items no longer in any pack
        on sale show only to whoever has some. */}
    <details className="pack-collection"><summary>{chosen.name} · {owned} of {chosen.items.length}</summary>
      <ul className="collection">{chosen.items.map(entry => collectionItem(entry, collection.get(entry.key) ?? 0))}</ul>
      {others.length > 0 && <><h4 className="side-subhead">No longer in packs</h4><ul className="collection">{others.map(entry => collectionItem(entry, collection.get(entry.key) ?? 0))}</ul></>}
      <p className="odds">Chances per item: {RARITY_KEYS.filter(key => chosen.chances[key] > 0).map(key => `${RARITY_NAMES[key]} ${chosen.chances[key]}%`).join(' · ')}{chosen.godPackOdds > 0 ? ` · god pack 1 in ${chosen.godPackOdds.toLocaleString()}` : ''}</p>
    </details>
  </div>;
}

/** An item's picture when it has one, otherwise its emoji. */
export function ItemArt({ item }: { item: PackItemView | undefined }) {
  return item?.image ? <img className="item-art" src={item.image} alt="" draggable={false} /> : <>{item?.emoji}</>;
}

function collectionItem(entry: PackItemView, count: number) {
  return <li key={entry.key} className={`rarity-${entry.rarity}${count ? '' : ' missing'}`} title={count ? entry.flavor : undefined}>
    <span aria-hidden="true">{count ? <ItemArt item={entry} /> : '❔'}</span><small>{count ? `${entry.name}${count > 1 ? ` ×${count}` : ''}` : rarityName(entry.rarity)}</small></li>;
}

/** The cards one at a time: the latest big and turned over, the earlier ones small above it, the rest still in the stack. */
function RevealStack({ opening, item, onNext, onShowAll }: { opening: Opening; item: Lookup; onNext: () => void; onShowAll: () => void }) {
  const { order, shown } = opening; const current = shown > 0 ? order[shown - 1]! : null; const found = current ? item(current) : undefined;
  const rarity = found?.rarity ?? 'common'; const left = order.length - shown; const last = shown >= order.length;
  // Epic and legendary make the phone buzz briefly (where phones allow it).
  useEffect(() => {
    if (!current || reducedMotion()) return;
    const pattern = rarity === 'legendary' ? [70, 50, 70, 50, 160] : rarity === 'epic' ? [60, 40, 90] : null;
    if (pattern && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const big = rarity === 'epic' || rarity === 'legendary'; const sparks = rarity === 'rare' ? 8 : 16;
  return <div className={`pack-stage revealing reveal-${current ? rarity : 'none'}`}>
    {/* A flash over the whole sheet for epic and legendary, and confetti for legendary. */}
    {current && big && <span key={`flash-${shown}`} className={`pack-flash flash-${rarity}`} aria-hidden="true" />}
    {current && rarity === 'legendary' && <span key={`confetti-${shown}`} className="pack-confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 7) * 90}ms`, background: ['#ffcf4a', '#ff5fa2', '#7ce0ff', '#c77dff', '#fff'][index % 5] }} />)}</span>}
    <ol className="pack-row" aria-label="Shown so far">{order.slice(0, Math.max(0, shown - 1)).map((key, index) => { const earlier = item(key); return <li key={index} className={`rarity-${earlier?.rarity ?? 'common'}`} title={earlier?.name}><span aria-hidden="true"><ItemArt item={earlier} /></span></li>; })}</ol>
    <div className="pack-stack">
      {/* The rest of the stack, face down and all alike (nothing gives away what comes), behind the current card. */}
      {Array.from({ length: Math.min(left, 3) }, (_, index) => <span key={index} className="card-back stacked" style={{ transform: `translate(${(index + 1) * 5}px, ${(index + 1) * 5}px)` }} aria-hidden="true" />)}
      <button type="button" className="card-next" onClick={onNext} aria-label={last ? 'See all four' : shown === 0 ? 'Turn over the first card' : 'Turn over the next card'}>
        {current ? <span key={shown} className={`pack-card flipped rarity-${rarity}`}>
          <span className="card-face card-back" aria-hidden="true" />
          <span className="card-face card-front">
            {rarity === 'legendary' && <span className="card-rays" aria-hidden="true" />}
            {rarity !== 'common' && <span className="card-burst" aria-hidden="true">{Array.from({ length: sparks }, (_, index) => <i key={index} style={{ transform: `rotate(${index * (360 / sparks)}deg)` }} />)}</span>}
            {rarity === 'rare' && <span className="card-stars" aria-hidden="true">{['✦', '✧', '✦', '✧', '✦'].map((star, index) => <i key={index}>{star}</i>)}</span>}
            <span className="card-emoji" aria-hidden="true"><ItemArt item={found} /></span><strong>{found?.name}</strong><small>{rarityName(rarity)}</small>
            <em className="card-flavor">{found?.flavor}</em>
          </span>
          {big && <span className="card-stamp" aria-hidden="true">{rarity === 'legendary' ? 'Legendary!' : 'Epic!'}</span>}
        </span> : <span className="pack-card"><span className="card-face card-back" aria-hidden="true" /></span>}
      </button>
    </div>
    <p className="pack-hint" role="status">{current ? `${rarityName(rarity)}: ${found?.name}. ` : ''}{last ? 'Tap to see all four.' : `Tap for the next card · ${left} left`}</p>
    {!last && <button type="button" className="link-button pack-skip" onClick={onShowAll}><FaIcon name="bolt" />Show all</button>}
  </div>;
}

import { useEffect, useRef, useState } from 'react';
import { packPrice, REFILL_CHIPS, WalletSchema, type Wallet } from '@party/contracts';
import { FaIcon } from '../presentation/icons.js';
import { SlotPays, Slots } from './slots.js';
import { Blackjack } from './blackjack.js';
import { Packs } from './packs.js';
import { Board } from './board.js';
import { chips, sideApi, sideProblem, st } from './side-api.js';
import './side-games.css';

type Tab = 'slots' | 'blackjack' | 'packs' | 'board';
// `short`: the name in the switcher (it has to fit next to the chips on a phone); `label`: the full name, read out.
const TAB_KEYS: { key: Tab; icon: string; label: 'nSlots' | 'nBlackjack' | 'nPacks' | 'nBoard'; short: 'tSlots' | 'tBlackjack' | 'tPacks' | 'tBoard' }[] = [
  { key: 'slots', icon: '🎰', label: 'nSlots', short: 'tSlots' }, { key: 'blackjack', icon: '🃏', label: 'nBlackjack', short: 'tBlackjack' },
  { key: 'packs', icon: '🎁', label: 'nPacks', short: 'tPacks' }, { key: 'board', icon: '📊', label: 'nBoard', short: 'tBoard' },
];
const tabList = () => TAB_KEYS.map(entry => ({ ...entry, label: st(entry.label), short: st(entry.short) }));

/** The side games sheet on a player's phone: chips at the top, one game at a time. */
export default function SideGames({ sessionId, selfId }: { sessionId: string; selfId: string | null }) {
  const [wallet, setWallet] = useState<Wallet>(); const [error, setError] = useState(''); const [tab, setTab] = useState<Tab>('slots');
  const [collection, setCollection] = useState(new Map<string, number>()); const [info, setInfo] = useState(false); const [picking, setPicking] = useState(false);
  useEffect(() => {
    void sideApi(sessionId, '').then(data => { const loaded = WalletSchema.parse(data); setWallet(loaded); setCollection(new Map(loaded.collection.map(entry => [entry.itemKey, entry.count]))); if (loaded.blackjack) setTab('blackjack'); })
      .catch(cause => setError(sideProblem(cause)));
  }, [sessionId]);
  // The games grid closes on Escape or a tap anywhere outside the switcher line.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const outside = (event: PointerEvent) => { if (!top.current?.contains(event.target as Node)) setPicking(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setPicking(false); } };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, [picking]);
  if (error && !wallet) return <p role="alert" className="error">{error}</p>;
  if (!wallet) return <p role="status">{st('opening')}</p>;
  if (!wallet.enabled) return <p>{st('hostOff')}</p>;
  // Without chips the slot machine and blackjack are played just for fun: no balance, no bets, no leaderboard.
  // Packs are bought with chips, so without chips there is nothing to collect (and no leaderboard).
  const forChips = wallet.chips; const all = tabList(); const tabs = forChips ? all : all.filter(entry => entry.key !== 'board' && entry.key !== 'packs');
  const current = tabs.find(entry => entry.key === tab) ?? tabs[0]!;
  const setBalance = (balance: number) => setWallet(current => current && { ...current, balance, canRefill: balance < 10 });
  const refill = () => { setError(''); void sideApi<{ balance: number }>(sessionId, '/refill', {}).then(result => setWallet(current => current && { ...current, balance: result.balance, canRefill: false, refills: current.refills + 1 })).catch(cause => setError(sideProblem(cause))); };
  // One slim line on top: a small game switcher (the chosen game named, the others by their icon) and the chips;
  // the game itself is the main thing below it.
  return <div className="side-games">
    <div className="side-top" ref={top}>
      {/* One button with the game being played; it opens every game as a grid (room for many more games). */}
      <div className="side-picker">
        <button type="button" className="side-picker-button" aria-expanded={picking} aria-controls="side-picker-grid" onClick={() => setPicking(!picking)}>
          <span aria-hidden="true">{current.icon}</span><span>{current.short}</span><span className="side-picker-caret" aria-hidden="true">▾</span><span className="visually-hidden">{st('chooseOther')}</span></button>
      </div>
      <div className="side-top-end">
        {forChips && <p className="chip-pill" title={chips(wallet.balance)}><span aria-hidden="true">🪙</span> <strong><span className="visually-hidden">{st('chipsLabel')}</span>{wallet.balance.toLocaleString()}</strong>{wallet.account === 'guest' && <span className="visually-hidden">{st('roomOnly')}</span>}</p>}
      <button type="button" className="side-info-button" aria-expanded={info} aria-controls="side-info" aria-label={st('about')} title={st('about')} onClick={() => setInfo(!info)}><FaIcon name="circle-info" /></button>
        {/* Floats over the game below (it never pushes the game down); Escape or a tap outside closes it. */}
      {picking && <ul id="side-picker-grid" className="side-picker-grid" aria-label={st('sideGames')}>{tabs.map(entry => <li key={entry.key}>
      <button type="button" aria-current={tab === entry.key ? 'true' : undefined} onClick={() => { setTab(entry.key); setPicking(false); }}>
        <span className="side-picker-icon" aria-hidden="true">{entry.icon}</span><span>{entry.label}</span></button></li>)}</ul>}
    </div>
    </div>
    {forChips && wallet.canRefill && <button type="button" className="small-button refill" onClick={refill}>{st('refill', { count: REFILL_CHIPS })}</button>}
    {info && <SideInfo wallet={wallet} tab={tab} />}
    {error && <p role="alert" className="error">{error}</p>}
    <div id="side-panel" role="region" aria-label={current.label}>
      {tab === 'slots' && <Slots sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} chips={forChips} />}
      {tab === 'blackjack' && <Blackjack sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} open={wallet.blackjack} chips={forChips} />}
      {tab === 'packs' && forChips && <Packs sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} collection={collection} sets={wallet.packSets} otherItems={wallet.otherItems}
        onCollected={items => setCollection(current => { const next = new Map(current); for (const key of items) next.set(key, (next.get(key) ?? 0) + 1); return next; })} />}
      {tab === 'board' && forChips && <Board sessionId={sessionId} self={selfId} />}
    </div>
  </div>;
}

/** The (i): short blocks with icons and numbers (no paragraphs): the open game's payouts, how to earn chips, prices. */
function SideInfo({ wallet, tab }: { wallet: Wallet; tab: Tab }) {
  const forChips = wallet.chips; const { earn, startChips } = wallet.economy;
  const prices = wallet.packSets.map(packPrice); const cheapest = prices.length ? Math.min(...prices) : null;
  const tile = (icon: string, value: string, label: string) => <li><span className="info-icon" aria-hidden="true">{icon}</span><strong>{value}</strong><small>{label}</small></li>;
  return <div id="side-info" className="side-info">
    {tab === 'slots' && <section aria-label={st('whatPays')}><h3>{st('whatPays')}</h3><SlotPays /></section>}
    {forChips ? <>
      <section aria-label={st('earn')}><h3>{st('earn')}</h3><ul className="info-tiles">
        {tile('⭐', `${earn.perPoint}`, st('perPoint'))}
        {tile('🥇', `${earn.place[0]}`, st('places', { second: earn.place[1], third: earn.place[2], played: earn.played }))}
        {tile('🎮', `${earn.roundWin}`, st('perWin'))}
        {tile('🕹️', `${earn.arcadeWin}`, st('perArcade'))}
      </ul></section>
      <section aria-label={st('chipsSection')}><ul className="info-tiles">
        {tile('🪙', `${startChips}`, st('toStart'))}
        {cheapest !== null && tile('🎁', `${cheapest}`, st(prices.length > 1 ? 'cheapest' : 'aPack'))}
      </ul></section>
    </> : <p className="info-line"><span aria-hidden="true">🎲</span> {st('noChips')}</p>}
  </div>;
}

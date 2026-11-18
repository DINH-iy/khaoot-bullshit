import { useEffect, useState } from 'react';
import { REFILL_CHIPS, SIDE_GAME_NAMES, WalletSchema, type Wallet } from '@party/contracts';
import { FaIcon } from '../presentation/icons.js';
import { SlotPays, Slots } from './slots.js';
import { Blackjack } from './blackjack.js';
import { Packs } from './packs.js';
import { Board } from './board.js';
import { chips, sideApi, sideProblem } from './side-api.js';
import './side-games.css';

type Tab = 'slots' | 'blackjack' | 'packs' | 'board';
// `short`: the name in the switcher (it has to fit next to the chips on a phone); `label`: the full name, read out.
const TABS: { key: Tab; icon: string; label: string; short: string }[] = [
  { key: 'slots', icon: '🎰', label: SIDE_GAME_NAMES.slots, short: 'Slots' }, { key: 'blackjack', icon: '🃏', label: SIDE_GAME_NAMES.blackjack, short: 'Blackjack' },
  { key: 'packs', icon: '🎁', label: SIDE_GAME_NAMES.packs, short: 'Packs' }, { key: 'board', icon: '📊', label: 'Leaderboard', short: 'Board' },
];

/** The side games sheet on a player's phone: chips at the top, one game at a time. */
export default function SideGames({ sessionId, selfId }: { sessionId: string; selfId: string | null }) {
  const [wallet, setWallet] = useState<Wallet>(); const [error, setError] = useState(''); const [tab, setTab] = useState<Tab>('slots');
  const [collection, setCollection] = useState(new Map<string, number>()); const [info, setInfo] = useState(false);
  useEffect(() => {
    void sideApi(sessionId, '').then(data => { const loaded = WalletSchema.parse(data); setWallet(loaded); setCollection(new Map(loaded.collection.map(entry => [entry.itemKey, entry.count]))); if (loaded.blackjack) setTab('blackjack'); })
      .catch(cause => setError(sideProblem(cause)));
  }, [sessionId]);
  if (error && !wallet) return <p role="alert" className="error">{error}</p>;
  if (!wallet) return <p role="status">Opening the games…</p>;
  if (!wallet.enabled) return <p>The host has switched side games off for this room.</p>;
  // Without chips the slot machine and blackjack are played just for fun: no balance, no bets, no leaderboard.
  // Packs are bought with chips, so without chips there is nothing to collect (and no leaderboard).
  const forChips = wallet.chips; const tabs = forChips ? TABS : TABS.filter(entry => entry.key !== 'board' && entry.key !== 'packs');
  const setBalance = (balance: number) => setWallet(current => current && { ...current, balance, canRefill: balance < 10 });
  const refill = () => { setError(''); void sideApi<{ balance: number }>(sessionId, '/refill', {}).then(result => setWallet(current => current && { ...current, balance: result.balance, canRefill: false, refills: current.refills + 1 })).catch(cause => setError(sideProblem(cause))); };
  // One slim line on top: a small game switcher (the chosen game named, the others by their icon) and the chips;
  // the game itself is the main thing below it.
  return <div className="side-games">
    <div className="side-top">
      <div className="side-tabs" role="tablist" aria-label="Side games">
        {tabs.map(entry => <button key={entry.key} type="button" role="tab" id={`side-tab-${entry.key}`} aria-controls="side-panel" aria-selected={tab === entry.key} aria-label={entry.label} title={entry.label} onClick={() => setTab(entry.key)}>
          <span aria-hidden="true">{entry.icon}</span></button>)}
      </div>
      <div className="side-top-end">
        {forChips && <p className="chip-pill" title={chips(wallet.balance)}><span aria-hidden="true">🪙</span> <strong><span className="visually-hidden">Chips: </span>{wallet.balance.toLocaleString()}</strong>{wallet.account === 'guest' && <span className="visually-hidden"> (this room only)</span>}</p>}
      <button type="button" className="side-info-button" aria-expanded={info} aria-controls="side-info" aria-label="About the side games and chips" title="About the side games and chips" onClick={() => setInfo(!info)}><FaIcon name="circle-info" /></button>
      </div>
    </div>
    {forChips && wallet.canRefill && <button type="button" className="small-button refill" onClick={refill}>Broke? Get {REFILL_CHIPS}</button>}
    {info && <SideInfo wallet={wallet} tab={tab} />}
    {error && <p role="alert" className="error">{error}</p>}
    <div id="side-panel" role="tabpanel" aria-labelledby={`side-tab-${tab}`}>
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
  const prices = wallet.packSets.map(set => set.price); const cheapest = prices.length ? Math.min(...prices) : null;
  const tile = (icon: string, value: string, label: string) => <li><span className="info-icon" aria-hidden="true">{icon}</span><strong>{value}</strong><small>{label}</small></li>;
  return <div id="side-info" className="side-info">
    {tab === 'slots' && <section aria-label="What pays"><h3>What pays</h3><SlotPays /></section>}
    {forChips ? <>
      <section aria-label="Earn chips"><h3>Earn chips</h3><ul className="info-tiles">
        {tile('⭐', `${earn.perPoint}`, 'per point')}
        {tile('🥇', `${earn.place[0]}`, `🥈 ${earn.place[1]} · 🥉 ${earn.place[2]} · others ${earn.played}`)}
        {tile('🎮', `${earn.roundWin}`, 'per minigame or duel won')}
        {tile('🕹️', `${earn.arcadeWin}`, 'per arcade win')}
      </ul></section>
      <section aria-label="Chips"><ul className="info-tiles">
        {tile('🪙', `${startChips}`, 'to start')}
        {cheapest !== null && tile('🎁', `${cheapest}`, prices.length > 1 ? 'the cheapest pack' : 'a pack')}
      </ul></section>
    </> : <p className="info-line"><span aria-hidden="true">🎲</span> No chips in this room: just for fun.</p>}
  </div>;
}

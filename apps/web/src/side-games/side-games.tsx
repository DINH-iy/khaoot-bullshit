import { useEffect, useState } from 'react';
import { REFILL_CHIPS, SIDE_GAME_NAMES, WalletSchema, type Wallet } from '@party/contracts';
import { Slots } from './slots.js';
import { Blackjack } from './blackjack.js';
import { Packs } from './packs.js';
import { Board } from './board.js';
import { chips, sideApi, sideProblem } from './side-api.js';
import './side-games.css';

type Tab = 'slots' | 'blackjack' | 'packs' | 'board';
const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'slots', icon: '🎰', label: SIDE_GAME_NAMES.slots }, { key: 'blackjack', icon: '🃏', label: SIDE_GAME_NAMES.blackjack },
  { key: 'packs', icon: '🎁', label: SIDE_GAME_NAMES.packs }, { key: 'board', icon: '📊', label: 'Leaderboard' },
];

/** The side games sheet on a player's phone: chips at the top, one game at a time. */
export default function SideGames({ sessionId, selfId }: { sessionId: string; selfId: string | null }) {
  const [wallet, setWallet] = useState<Wallet>(); const [error, setError] = useState(''); const [tab, setTab] = useState<Tab>('slots');
  const [collection, setCollection] = useState(new Map<string, number>());
  useEffect(() => {
    void sideApi(sessionId, '').then(data => { const loaded = WalletSchema.parse(data); setWallet(loaded); setCollection(new Map(loaded.collection.map(entry => [entry.itemKey, entry.count]))); if (loaded.blackjack) setTab('blackjack'); })
      .catch(cause => setError(sideProblem(cause)));
  }, [sessionId]);
  if (error && !wallet) return <p role="alert" className="error">{error}</p>;
  if (!wallet) return <p role="status">Getting your chips…</p>;
  if (!wallet.enabled) return <p>The host has switched side games off for this room.</p>;
  const setBalance = (balance: number) => setWallet(current => current && { ...current, balance, canRefill: balance < 10 });
  const refill = () => { setError(''); void sideApi<{ balance: number }>(sessionId, '/refill', {}).then(result => setWallet(current => current && { ...current, balance: result.balance, canRefill: false, refills: current.refills + 1 })).catch(cause => setError(sideProblem(cause))); };
  return <div className="side-games">
    <div className="chip-bar">
      <p><span aria-hidden="true">🪙</span> <strong>{chips(wallet.balance)}</strong>{wallet.account === 'guest' && <small> · this room only</small>}</p>
      {wallet.canRefill && <button type="button" className="small-button" onClick={refill}>Broke? Get {REFILL_CHIPS}</button>}
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="side-tabs" role="tablist" aria-label="Side games">
      {TABS.map(entry => <button key={entry.key} type="button" role="tab" id={`side-tab-${entry.key}`} aria-controls="side-panel" aria-selected={tab === entry.key} onClick={() => setTab(entry.key)}>
        <span aria-hidden="true">{entry.icon}</span>{entry.label}</button>)}
    </div>
    <div id="side-panel" role="tabpanel" aria-labelledby={`side-tab-${tab}`}>
      {tab === 'slots' && <Slots sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} />}
      {tab === 'blackjack' && <Blackjack sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} open={wallet.blackjack} />}
      {tab === 'packs' && <Packs sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} collection={collection}
        onCollected={items => setCollection(current => { const next = new Map(current); for (const key of items) next.set(key, (next.get(key) ?? 0) + 1); return next; })} />}
      {tab === 'board' && <Board sessionId={sessionId} self={selfId} />}
    </div>
    <p className="sheet-title">Play chips only, never real money.{wallet.account === 'guest' ? ' With a personal link from the organiser your chips carry over to the next game.' : ''}</p>
  </div>;
}

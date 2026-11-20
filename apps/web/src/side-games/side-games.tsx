import { useLayoutEffect, useRef, useState } from 'react';
import { packPrice, REFILL_CHIPS, type PhoneMenuAction, type PhoneMenuIcons, type Wallet } from '@party/contracts';
import { Icon } from '../presentation/line-icons.js';
import { BottomSheet } from '../room-extras/bottom-sheet.js';
import { PhoneMenuIcon } from '../room-extras/phone-menu-icon.js';
import { SlotPays, Slots } from './slots.js';
import { Blackjack } from './blackjack.js';
import { SoloRoulette } from './roulette-table.js';
import { SoloCoin } from './prediction.js';
import { Packs } from './packs.js';
import { Board } from './board.js';
import { chips, sideApi, sideProblem, st } from './side-api.js';
import type { useSideWallet } from './use-side-wallet.js';
import './side-games.css';

const TABS = [
  { key: 'slots', icon: 'slots', label: 'nSlots', short: 'tSlots' },
  { key: 'blackjack', icon: 'blackjack', label: 'nBlackjack', short: 'tBlackjack' },
  { key: 'red-or-black-roulette', icon: 'roulette', label: 'nRoulette', short: 'tRoulette' },
  { key: 'heads-or-tails', icon: 'coin', label: 'nCoin', short: 'tCoin' },
  { key: 'packs', icon: 'packs', label: 'nPacks', short: 'tPacks' },
  { key: 'board', icon: 'leaderboard', label: 'nBoard', short: 'tBoard' },
] as const satisfies readonly { key: string; icon: PhoneMenuAction; label: Parameters<typeof st>[0]; short: Parameters<typeof st>[0] }[];
export type SideGame = typeof TABS[number]['key'];

/** Show the picker immediately. Chip balances, packs and open hands still come from the server. */
export function SideGamesSheet({ title, onClose, sessionId, selfId, selected, onSelect, withChips, icons, state }: {
  title: string; onClose: () => void; sessionId: string; selfId: string | null; selected: SideGame | null; onSelect: (game: SideGame) => void;
  withChips: boolean; icons: PhoneMenuIcons | undefined; state: ReturnType<typeof useSideWallet>;
}) {
  const [info, setInfo] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const tabs = withChips ? TABS : TABS.filter(entry => entry.key !== 'board');
  const current = tabs.find(entry => entry.key === selected);
  const tab = current?.key;
  const showingPicker = picking || !current;
  const wallet = state.wallet?.chips === withChips ? state.wallet : undefined;
  const picker = useRef<HTMLUListElement>(null);
  const switcher = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    if (showingPicker) (picker.current?.querySelector<HTMLButtonElement>('[aria-current]') ?? picker.current?.querySelector('button'))?.focus();
    else switcher.current?.focus();
  }, [showingPicker]);
  const setBalance = (balance: number) => state.update(current => ({ ...current, balance, canRefill: balance < 10 }));
  const refill = () => {
    setError('');
    void sideApi<{ balance: number }>(sessionId, '/refill', {}).then(result => state.update(current =>
      ({ ...current, balance: result.balance, canRefill: false, refills: current.refills + 1 }))).catch(cause => setError(sideProblem(cause)));
  };
  const enabled = wallet?.enabled !== false;
  const about = <button type="button" className="side-info-button" disabled={!wallet} aria-expanded={info}
    aria-controls={info && wallet ? 'side-info' : undefined} aria-label={st('about')} title={st('about')}
    onClick={() => setInfo(!info)}><Icon name="about" /></button>;

  return <BottomSheet title={title} onClose={onClose} resizable actions={enabled ? about : undefined}>
    {enabled ? <div className="side-games" onKeyDown={event => {
      if (event.key === 'Escape' && picking && current) {
        event.preventDefault();
        moveFocus.current = true;
        setPicking(false);
      }
    }}>
      {(current || (withChips && wallet)) && <div className="side-top">
        {current && <button ref={switcher} type="button" className="side-picker-button" aria-expanded={showingPicker}
          onClick={() => { moveFocus.current = true; setPicking(!showingPicker); setInfo(false); }}>
          <PhoneMenuIcon action={current.icon} icons={icons} /><span>{st(current.short)}</span><span className="side-picker-caret" aria-hidden="true">▾</span>
          <span className="visually-hidden">{st('chooseOther')}</span>
        </button>}
        {withChips && wallet && <p className="chip-pill" title={chips(wallet.balance)}><Icon name="coin" size={18} /> <strong><span className="visually-hidden">{st('chipsLabel')}</span>{wallet.balance.toLocaleString()}</strong>{wallet.account === 'guest' && <span className="visually-hidden">{st('roomOnly')}</span>}</p>}
      </div>}
      {withChips && wallet?.canRefill && <button type="button" className="small-button refill" onClick={refill}>{st('refill', { count: REFILL_CHIPS })}</button>}
      {info && wallet && <SideInfo wallet={wallet} tab={showingPicker ? undefined : tab} />}
      {error && <p role="alert" className="error">{error}</p>}
      {showingPicker && <ul ref={picker} className="side-picker-grid" aria-label={st('sideGames')}>{tabs.map(entry => <li key={entry.key}>
        <button type="button" aria-current={tab === entry.key ? 'true' : undefined} onClick={() => {
          moveFocus.current = true;
          onSelect(entry.key);
          setPicking(false);
          setInfo(false);
        }}><PhoneMenuIcon action={entry.icon} icons={icons} /><span>{st(entry.label)}</span></button>
      </li>)}</ul>}
      {!showingPicker && current && <div role="region" aria-label={st(current.label)} aria-busy={!wallet && !state.error}>
        {!wallet && (state.error ? <><p role="alert" className="error">{state.error}</p>
          <button type="button" className="small-button" onClick={state.retry}>{st('retry')}</button></> : <p className="hint" role="status">{st('openingGame')}</p>)}
        {wallet && <>
          {tab === 'slots' && <Slots sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} chips={withChips} />}
          {tab === 'blackjack' && <Blackjack sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} open={wallet.blackjack} chips={withChips}
            onHand={hand => state.update(current => ({ ...current, blackjack: hand }))} />}
          {tab === 'heads-or-tails' && <SoloCoin sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} forChips={withChips} />}
          {tab === 'red-or-black-roulette' && <SoloRoulette sessionId={sessionId} balance={wallet.balance} onBalance={setBalance} forChips={withChips} />}
          {tab === 'packs' && <Packs forChips={withChips} sessionId={sessionId} balance={wallet.balance} onBalance={setBalance}
            collection={new Map(wallet.collection.map(entry => [entry.itemKey, entry.count]))} sets={wallet.packSets} otherItems={wallet.otherItems}
            onCollected={items => state.update(current => {
              const counts = new Map(current.collection.map(entry => [entry.itemKey, entry.count]));
              for (const key of items) counts.set(key, (counts.get(key) ?? 0) + 1);
              return { ...current, collection: Array.from(counts, ([itemKey, count]) => ({ itemKey, count })) };
            })} />}
          {tab === 'board' && <Board sessionId={sessionId} self={selfId} />}
        </>}
      </div>}
    </div> : <p>{st('hostOff')}</p>}
  </BottomSheet>;
}

/** The (i): short blocks with icons and numbers (no paragraphs): the open game's payouts, how to earn chips, prices. */
function SideInfo({ wallet, tab }: { wallet: Wallet; tab: SideGame | undefined }) {
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

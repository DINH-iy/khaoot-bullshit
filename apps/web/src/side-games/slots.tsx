import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BETS, SLOT_SYMBOLS, SlotResultSchema, TWO_CHERRIES_PAYS, slotMultiplier, type SlotResult, type SlotSymbol } from '@party/contracts';
import { newId } from '../room/api.js';
import { calm, chips, sideApi, sideProblem, st } from './side-api.js';

const emoji = (key: string) => SLOT_SYMBOLS.find(symbol => symbol.key === key)?.emoji ?? '❔';
const name = (key: string) => { const index = SLOT_SYMBOLS.findIndex(symbol => symbol.key === key); return st('symbols').split('|')[index] ?? key; };

/** What the slot machine pays (shown in the side games' (i) while the slot machine is open). */
export function SlotPays() {
  return <ul className="slot-pays">{SLOT_SYMBOLS.map(symbol => <li key={symbol.key}><span aria-hidden="true">{symbol.emoji.repeat(3)}</span><span className="visually-hidden">{st('three', { symbol: name(symbol.key) })}</span><strong>×{symbol.pays}</strong></li>)}
    <li><span aria-hidden="true">🍒🍒</span><span className="visually-hidden">{st('twoCherries')}</span><strong>{TWO_CHERRIES_PAYS === 1 ? st('betBack') : `×${TWO_CHERRIES_PAYS}`}</strong></li></ul>;
}

const stopTimes = [950, 1450, 1960] as const;
const reelSymbols = SLOT_SYMBOLS.map(symbol => symbol.key);
const neighbor = (symbol: SlotSymbol, delta: number) => reelSymbols[(reelSymbols.indexOf(symbol) + delta + reelSymbols.length) % reelSymbols.length]!;

function Reel({ index, previous, target, waiting }: { index: number; previous: SlotSymbol; target: SlotSymbol | undefined; waiting: boolean }) {
  const steps = 12 + index * 6;
  const at = target ?? previous;
  const strip = target ? [neighbor(previous, -1), previous, ...Array.from({ length: steps - 1 }, (_, step) => reelSymbols[(step + index) % reelSymbols.length]!),
    target, neighbor(target, 1)]
    : waiting ? Array.from({ length: 2 * reelSymbols.length + 2 }, (_, i) => reelSymbols[(i + index) % reelSymbols.length]!)
    : [neighbor(at, -1), at, neighbor(at, 1)];
  const style = { '--reel-steps': target ? steps : reelSymbols.length, '--reel-duration': `${stopTimes[index]}ms` } as CSSProperties;
  return <span className="reel" aria-hidden="true">
    <span className={`reel-strip${target ? ' landing' : waiting ? ' rolling' : ''}`} style={style}>
      {strip.map((symbol, i) => <span className="reel-symbol" key={i}>{emoji(symbol)}</span>)}
    </span>
  </span>;
}

/** The server draws the symbols. The reel strips slow down and stop on those exact symbols. */
export function Slots({ sessionId, balance, onBalance, chips: forChips }: { sessionId: string; balance: number; onBalance: (balance: number) => void; chips: boolean }) {
  const [bet, setBet] = useState<typeof BETS[number]>(10);
  const [result, setResult] = useState<SlotResult>();
  const [landing, setLanding] = useState<SlotResult>();
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; clearTimeout(timer.current); };
  }, []);
  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setError('');
    const finish = (outcome: SlotResult) => {
      if (!active.current) return;
      setResult(outcome);
      setLanding(undefined);
      setSpinning(false);
      onBalance(outcome.balance);
    };
    try {
      const outcome = SlotResultSchema.parse(await sideApi(sessionId, '/slots', { roundId: newId(), bet }));
      if (!active.current) return;
      if (calm()) finish(outcome);
      else {
        setLanding(outcome);
        timer.current = setTimeout(() => finish(outcome), stopTimes[2] + 80);
      }
    } catch (cause) {
      if (active.current) { setError(sideProblem(cause)); setSpinning(false); }
    }
  };
  const won = result && (forChips ? result.payout > 0 : slotMultiplier(result.reels) > 0);
  return <div className="side-game slots">
    <div className={`reels${!spinning && won ? ' reels-win' : ''}`} role="img" aria-label={result && !spinning ? st('reelsNamed', { list: result.reels.map(name).join(', ') }) : st('reels')}>
      {[0, 1, 2].map(index => <Reel key={`${landing?.roundId ?? (spinning ? 'rolling' : 'idle')}:${index}`} index={index}
        previous={result?.reels[index] ?? (['seven', 'bell', 'cherry'] as const)[index]!} target={landing?.reels[index]} waiting={spinning} />)}
    </div>
    <p className="side-outcome" role="status">{spinning ? st('spinning') : !result ? st('lineUp') : won ? (forChips ? st('youWin', { amount: chips(result.payout) }) : st('winner', { times: slotMultiplier(result.reels) })) : st('noLuck')}</p>
    {forChips && <fieldset className="bet-picker" disabled={spinning}><legend>{st('bet')}</legend>
      {BETS.map(amount => <label key={amount} className={bet === amount ? 'chosen' : ''}><input type="radio" name="slot-bet" checked={bet === amount} onChange={() => setBet(amount)} />{amount}</label>)}
    </fieldset>}
    {error && <p role="alert" className="error">{error}</p>}
    <button type="button" className="primary big" disabled={spinning || (forChips && balance < bet)} onClick={() => void spin()}>{forChips ? st('spinFor', { amount: chips(bet) }) : st('spin')}</button>
  </div>;
}

import { COIN_SIDES, type CoinSide } from '@party/contracts';
import { useTexts } from '../../i18n/texts.js';
import { COIN_TEXTS } from './coin.text.js';
import type { Result } from '../shared/countdown.js';
import './coin.css';

const mark = (side: CoinSide) => side === 'heads' ? '♛' : '✦';

export function CoinChoices({ disabled, onPick }: { disabled: boolean; onPick: (side: CoinSide) => void }) {
  const t = useTexts(COIN_TEXTS);
  return <div className="coin-choices">{COIN_SIDES.map(side =>
    <button key={side} type="button" className="coin-choice" disabled={disabled} onClick={() => onPick(side)}>
      <span className={`coin-face ${side}`} aria-hidden="true">{mark(side)}</span>{t(side)}
    </button>)}</div>;
}

export function CoinPhone({ disabled, onResult }: { disabled: boolean; onResult: (result: Result) => void }) {
  return <CoinChoices disabled={disabled} onPick={side => onResult({ value: COIN_SIDES.indexOf(side) })} />;
}

export function CoinReveal({ coin, animate }: { coin: CoinSide; animate: boolean }) {
  const t = useTexts(COIN_TEXTS);
  const other = coin === 'heads' ? 'tails' : 'heads';
  return <div className={`coin-reveal${animate ? ' coin-reveal-animated' : ''}`}>
    {animate && <span className="coin-scene" aria-hidden="true"><span className="coin-turn">
      <span className={`coin-face ${coin}`}>{mark(coin)}</span>
      <span className={`coin-face coin-back ${other}`}>{mark(other)}</span>
    </span></span>}
    <p role="status">{t('landed', { side: t(coin) })}</p>
  </div>;
}

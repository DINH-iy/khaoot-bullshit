import { COIN_SIDES, type CoinSide } from '@party/contracts';
import type { CSSProperties } from 'react';
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
  return <div className={`coin-reveal${animate ? ' coin-reveal-animated' : ''}`}>
    {animate && <span className="coin-scene" data-landing={coin} aria-hidden="true">
      <span className="coin-shadow" />
      <span className="coin-lift"><span className="coin-turn">
        {[-3, -2, -1, 0, 1, 2, 3].map(layer => <span key={layer} className="coin-rim" style={{ '--rim-depth': `${layer * 1.25}px` } as CSSProperties} />)}
        <span className="coin-face heads">{mark('heads')}</span>
        <span className="coin-face tails coin-back">{mark('tails')}</span>
      </span></span>
    </span>}
    <p role="status">{t('landed', { side: t(coin) })}</p>
  </div>;
}

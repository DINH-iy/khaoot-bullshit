import { BUS_RAINBOW, BusViewSchema, busRainbowOpen, type BusGuess, type MinigameSettings, type PlayingCard } from '@party/contracts';
import { translate, useTexts } from '../../i18n/texts.js';
import { BUS_TEXTS } from './bus.text.js';
import './bus.css';
import type { StepRenderer } from '../shared/steps/step-game.js';

// Suits as playing-card symbols (text presentation, never emoji), red or black.
const SUIT = { hearts: '♥︎', diamonds: '♦︎', clubs: '♣︎', spades: '♠︎' } as const;
const RANK: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RANK_NAME = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' } as const;
const b = (key: keyof typeof BUS_TEXTS.en, values?: Record<string, string | number>) => translate(BUS_TEXTS, key, values);
const cardName = (card: PlayingCard | undefined) => {
  if (!card) return b('down');
  const rank = RANK_NAME[card.rank as keyof typeof RANK_NAME];
  return b('card', { rank: rank ? b(rank) : card.rank, suit: b(card.suit) });
};
const busView = (view: unknown) => { const parsed = BusViewSchema.safeParse(view); return parsed.success ? parsed.data : { cards: [], guesses: [], right: [], sips: 0 }; };
const sipText = (count: number) => b(count === 1 ? 'sip' : 'sips', { count });

/** One playing card: face up (marked right or wrong), or face down. */
function Card({ card, right }: { card: PlayingCard | undefined; right: boolean | undefined }) {
  const t = useTexts(BUS_TEXTS);
  if (!card) return <span className="bus-card down" role="img" aria-label={t('down')} />;
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return <span className={`bus-card${red ? ' red' : ''}${right === false ? ' wrong' : ''}`} role="img" aria-label={`${cardName(card)}${right === undefined ? '' : `, ${t(right ? 'correct' : 'wrong')}`}`}>
    <span className="bus-rank" aria-hidden="true">{RANK[card.rank] ?? card.rank}</span><span className="bus-suit" aria-hidden="true">{SUIT[card.suit]}</span>
    {right !== undefined && <span className={`bus-mark ${right ? 'right' : 'wrong'}`} aria-hidden="true">{right ? '✓' : '✗'}</span>}
  </span>;
}

export const bus: StepRenderer = {
  question: (view, step, settings) => {
    const { cards } = busView(view);
    if (step === 0) return b('roundOne');
    // The cards above show which card the question is about, so the question stays short.
    if (step === 1) return b('roundTwo');
    if (step === 2) return b('roundThree');
    return b(busRainbowOpen(cards, settings as MinigameSettings<'bus'>) ? 'roundFourRainbow' : 'roundFour');
  },
  label: option => {
    const key = option as BusGuess;
    if (key === BUS_RAINBOW) return <><span className="bus-rainbow-mark" aria-hidden="true">🌈</span> {b('callRainbow')}</>;
    if (Object.hasOwn(SUIT, key)) return `${SUIT[key as PlayingCard['suit']]} ${b(key)}`;
    return Object.hasOwn(BUS_TEXTS.en, key) ? b(key) : option;
  },
  // What is at stake, as icons: ✗ 🍺 2 (a wrong guess); in round 4 with a rainbow possible also 🌈 ✓ 🍺 4 → the others.
  // The sentence is what screen readers hear.
  stake: (step, settings, view) => {
    const rules = settings as MinigameSettings<'bus'>; const count = rules.sips[step] ?? 0; const sips = sipText(count);
    const rainbow = step === 3 && view !== undefined && busRainbowOpen(busView(view).cards, rules);
    return <span className="bus-stakes" role="note" aria-label={rainbow ? b('stakeRainbow', { sips }) : b('stake', { sips })}>
      <span className="bus-chip bad" aria-hidden="true">✗ 🍺 {count}</span>
      {rainbow && <span className="bus-chip rainbow" aria-hidden="true">🌈 ✓ 🍺 {count} → {b('others')}</span>}
    </span>;
  },
  board: (side, _settings, mine) => {
    const view = busView(side.view); const last = view.right.length - 1;
    return <div className="bus-board-side">
      <span className={`bus-cards${mine ? ' big' : ''}`}>{[0, 1, 2, 3].map(at => <Card key={at} card={view.cards[at]} right={view.right[at]} />)}</span>
      <span className="bus-sips" role="img" aria-label={sipText(view.sips)}><span aria-hidden="true">🍺 {view.sips}</span></span>
      {mine && last >= 0 && <p className={`bus-verdict ${view.right[last] ? 'bus-safe' : 'bus-drink'}`} role="status"><span aria-hidden="true">{view.right[last] ? '✓' : '🍺'}</span> {view.right[last] ? b('safe') : b(view.guesses[last] === BUS_RAINBOW ? 'missedRainbow' : 'drink')}</p>}
      {view.rainbow && <p className="bus-rainbow" role="status"><span aria-hidden="true">🌈</span> {b('rainbow')}</p>}
      {mine && (view.extra ?? 0) > 0 && <p className="bus-drink"><span aria-hidden="true">🍺</span> {b('extra', { sips: view.extra ?? 0 })}</p>}
    </div>;
  },
};


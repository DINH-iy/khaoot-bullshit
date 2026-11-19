import { BusViewSchema, DoorsViewSchema, type BusGuess, type MinigameKey, type MinigameSettings, type PlayingCard } from '@party/contracts';
import { Mark } from '../../presentation/mark-icons.js';
import { translate, useTexts } from '../../i18n/texts.js';
import { CONTROL_TEXTS } from '../controls.text.js';
import { BUS_TEXTS } from './bus.text.js';
import type { StepRenderer } from './step-game.js';

// ---------- Drive the bus ----------
// Suits as playing-card symbols (text presentation, never emoji), red or black.
const SUIT = { hearts: '♥︎', diamonds: '♦︎', clubs: '♣︎', spades: '♠︎' } as const;
const RANK: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RANK_NAME = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' } as const;
const b = (key: keyof typeof BUS_TEXTS.en, values?: Record<string, string | number>) => translate(BUS_TEXTS, key, values);
const c = (key: keyof typeof CONTROL_TEXTS.en, values?: Record<string, string | number>) => translate(CONTROL_TEXTS, key, values);
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

const bus: StepRenderer = {
  question: (view, step) => {
    const { cards } = busView(view);
    if (step === 0) return b('roundOne');
    if (step === 1) return b('roundTwo', { first: cardName(cards[0]) });
    if (step === 2) return b('roundThree', { first: cardName(cards[0]), second: cardName(cards[1]) });
    return b('roundFour');
  },
  label: option => {
    const key = option as BusGuess;
    if (Object.hasOwn(SUIT, key)) return `${SUIT[key as PlayingCard['suit']]} ${b(key)}`;
    return Object.hasOwn(BUS_TEXTS.en, key) ? b(key) : option;
  },
  stake: (step, settings) => b('stake', { sips: sipText((settings as MinigameSettings<'bus'>).sips[step] ?? 0) }),
  board: (side, _settings, mine) => {
    const view = busView(side.view); const last = view.right.length - 1;
    return <div className="bus-board-side">
      <span className={`bus-cards${mine ? ' big' : ''}`}>{[0, 1, 2, 3].map(at => <Card key={at} card={view.cards[at]} right={view.right[at]} />)}</span>
      <span className="bus-sips">{sipText(view.sips)}</span>
      {mine && last >= 0 && <p className={view.right[last] ? 'bus-safe' : 'bus-drink'} role="status">{view.right[last] ? b('safe') : b('drink')}</p>}
      {view.rainbow && <p className="bus-rainbow" role="status">{b('rainbow')}</p>}
      {mine && (view.extra ?? 0) > 0 && <p className="bus-drink">{b('extra', { sips: sipText(view.extra ?? 0) })}</p>}
    </div>;
  },
};

// ---------- Lucky doors ----------
const doors: StepRenderer = {
  question: () => c('chooseDoor'),
  label: option => c('door', { number: Number(option) + 1 }),
  board: (side, settings) => {
    const picked = DoorsViewSchema.safeParse(side.view).data?.picked ?? null; const count = (settings as MinigameSettings<'lucky-doors'>).doorsMilli.length;
    return <ol className="mg-doors step-doors" aria-label={c('doors')}>{Array.from({ length: count }, (_, index) => <li key={index} className={`mg-door${picked === index ? ' picked' : ''}`}>{index + 1}</li>)}</ol>;
  },
};

// ---------- Left or right ----------
const majority: StepRenderer = {
  question: () => c('majority'),
  label: option => <span className="side-choice"><Mark text={option === 'left' ? '←' : '→'} />{c(option === 'left' ? 'left' : 'right')}</span>,
  // Only whether a side has chosen: what it chose stays secret until the reveal.
  board: side => <span className={`step-chosen${side.options ? '' : ' yes'}`}>{side.options ? '…' : c('chosen')}</span>,
};

export const STEP_RENDERERS: Partial<Record<MinigameKey, StepRenderer>> = { bus, 'lucky-doors': doors, majority };

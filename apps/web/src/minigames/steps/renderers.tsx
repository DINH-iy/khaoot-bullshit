import { BusViewSchema, DoorsViewSchema, type BusGuess, type MinigameKey, type MinigameSettings, type PlayingCard } from '@party/contracts';
import { Mark } from '../../presentation/mark-icons.js';
import type { StepRenderer } from './step-game.js';

// ---------- Drive the bus ----------
// Suits as playing-card symbols (text presentation, never emoji), red or black.
const SUIT = { hearts: '♥︎', diamonds: '♦︎', clubs: '♣︎', spades: '♠︎' } as const;
const RANK: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const RANK_NAME: Record<number, string> = { 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' };
const cardName = (card: PlayingCard) => `${RANK_NAME[card.rank] ?? card.rank} of ${card.suit}`;
const BUS_LABEL: Record<BusGuess, string> = { red: 'Red', black: 'Black', higher: 'Higher', lower: 'Lower', inside: 'Inside', outside: 'Outside',
  hearts: `${SUIT.hearts} Hearts`, diamonds: `${SUIT.diamonds} Diamonds`, clubs: `${SUIT.clubs} Clubs`, spades: `${SUIT.spades} Spades` };
const busView = (view: unknown) => { const parsed = BusViewSchema.safeParse(view); return parsed.success ? parsed.data : { cards: [], guesses: [], right: [], sips: 0 }; };
const sipText = (count: number) => `${count} ${count === 1 ? 'sip' : 'sips'}`;

/** One playing card: face up (marked right or wrong), or face down. */
function Card({ card, right }: { card: PlayingCard | undefined; right: boolean | undefined }) {
  if (!card) return <span className="bus-card down" role="img" aria-label="Card not turned yet" />;
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return <span className={`bus-card${red ? ' red' : ''}${right === false ? ' wrong' : ''}`} role="img" aria-label={`${cardName(card)}${right === undefined ? '' : right ? ', right' : ', wrong'}`}>
    <span className="bus-rank" aria-hidden="true">{RANK[card.rank] ?? card.rank}</span><span className="bus-suit" aria-hidden="true">{SUIT[card.suit]}</span>
    {right !== undefined && <span className={`bus-mark ${right ? 'right' : 'wrong'}`} aria-hidden="true">{right ? '✓' : '✗'}</span>}
  </span>;
}

const bus: StepRenderer = {
  question: (view, step) => {
    const { cards } = busView(view);
    if (step === 0) return 'Round 1 of 4 · Red or black?';
    if (step === 1) return `Round 2 of 4 · Higher or lower than the ${cardName(cards[0]!)}?`;
    if (step === 2) return `Round 3 of 4 · Inside or outside the ${cardName(cards[0]!)} and the ${cardName(cards[1]!)}?`;
    return 'Round 4 of 4 · Which suit?';
  },
  label: option => BUS_LABEL[option as BusGuess] ?? option,
  stake: (step, settings) => `Wrong: everyone in the team drinks ${sipText((settings as MinigameSettings<'bus'>).sips[step] ?? 0)}.`,
  board: (side, _settings, mine) => {
    const view = busView(side.view); const last = view.right.length - 1;
    return <div className="bus-board-side">
      <span className={`bus-cards${mine ? ' big' : ''}`}>{[0, 1, 2, 3].map(at => <Card key={at} card={view.cards[at]} right={view.right[at]} />)}</span>
      <span className="bus-sips">{sipText(view.sips)}</span>
      {mine && last >= 0 && <p className={view.right[last] ? 'bus-safe' : 'bus-drink'} role="status">{view.right[last] ? 'Right! No drinking this round.' : 'Wrong! Everyone in your team drinks.'}</p>}
      {view.rainbow && <p className="bus-rainbow" role="status">Rainbow! The other teams drink.</p>}
      {mine && (view.extra ?? 0) > 0 && <p className="bus-drink">+{sipText(view.extra ?? 0)} from another team’s rainbow.</p>}
    </div>;
  },
};

// ---------- Lucky doors ----------
const doors: StepRenderer = {
  question: () => 'Choose a door.',
  label: option => `Door ${Number(option) + 1}`,
  board: (side, settings) => {
    const picked = DoorsViewSchema.safeParse(side.view).data?.picked ?? null; const count = (settings as MinigameSettings<'lucky-doors'>).doorsMilli.length;
    return <ol className="mg-doors step-doors" aria-label="Doors">{Array.from({ length: count }, (_, index) => <li key={index} className={`mg-door${picked === index ? ' picked' : ''}`}>{index + 1}</li>)}</ol>;
  },
};

// ---------- Left or right ----------
const majority: StepRenderer = {
  question: () => 'Left or right? No talking: the majority wins.',
  label: option => <span className="side-choice"><Mark text={option === 'left' ? '←' : '→'} />{option === 'left' ? 'Left' : 'Right'}</span>,
  // Only whether a side has chosen: what it chose stays secret until the reveal.
  board: side => <span className={`step-chosen${side.options ? '' : ' yes'}`}>{side.options ? '…' : '✓ chosen'}</span>,
};

export const STEP_RENDERERS: Partial<Record<MinigameKey, StepRenderer>> = { bus, 'lucky-doors': doors, majority };

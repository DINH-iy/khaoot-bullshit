import { randomInt } from 'node:crypto';
import { CREATURES, CREATURE_MAX_HP, CREATURE_MOVE_KEYS, type HeadToHeadReplay } from '@party/contracts';
import { illegal, type HeadToHeadRules, type Seat } from './engine.js';

type Pick = typeof CREATURE_MOVE_KEYS[number];
type Frame = Extract<HeadToHeadReplay, { game: 'creature-duel' }>['frames'][number];
interface Battle extends Frame {
  turn: Seat;
  guards: [boolean, boolean];
  moves: Pick[];
  history: Frame[];
}
const damage = { jab: 4, surge: 6, crush: 8 } as const;
const heal = 5;
const MAX_TURNS = 40;
const opposite = (seat: Seat): Seat => seat === 0 ? 1 : 0;

function shuffled<T>(items: readonly T[]): T[] {
  const order = [...items];
  for (let index = order.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [order[index], order[other]] = [order[other]!, order[index]!];
  }
  return order;
}
const frameOf = ({ teams, active, last }: Frame): Frame => ({ teams, active, last });

export const creatureDuel: HeadToHeadRules<'creature-duel', Battle> = {
  start: settings => {
    const creatures = shuffled(CREATURES);
    const roster = (from: number) => creatures.slice(from, from + settings.size).map(kind => ({ kind, hp: CREATURE_MAX_HP }));
    const frame: Frame = { teams: [roster(0), roster(settings.size)], active: [0, 0], last: null };
    return { ...frame, guards: [false, false], turn: randomInt(2) as Seat, moves: shuffled(CREATURE_MOVE_KEYS).slice(0, 3), history: [frame] };
  },
  turn: state => state.turn,
  apply: (state, seat, { pick }) => {
    illegal(seat === state.turn);
    const other = opposite(seat);
    const teams: Frame['teams'] = [state.teams[0].map(creature => ({ ...creature })), state.teams[1].map(creature => ({ ...creature }))];
    const active: Frame['active'] = [...state.active];
    const guards: Battle['guards'] = [...state.guards];
    const mine = teams[seat][active[seat]]!;
    const opponent = teams[other][active[other]]!;
    const last = typeof pick === 'number' ? 'switch' : pick;
    if (typeof pick === 'number') {
      illegal(pick !== active[seat] && (teams[seat][pick]?.hp ?? 0) > 0);
      active[seat] = pick;
      guards[seat] = false;
    } else {
      illegal(state.moves.includes(pick) && mine.hp > 0 && opponent.hp > 0);
      if (pick === 'guard') guards[seat] = true;
      else if (pick === 'mend') mine.hp = Math.min(CREATURE_MAX_HP, mine.hp + heal);
      else {
        opponent.hp = Math.max(0, opponent.hp - damage[pick] / (guards[other] ? 2 : 1));
        guards[other] = false;
        if (opponent.hp === 0) {
          const replacement = teams[other].findIndex(creature => creature.hp > 0);
          if (replacement >= 0) active[other] = replacement;
        }
      }
    }
    const frame: Frame = { teams, active, last };
    return { ...frame, guards, turn: other, moves: shuffled(CREATURE_MOVE_KEYS).slice(0, 3), history: [...state.history, frame] };
  },
  outcome: state => {
    const health = state.teams.map(team => team.reduce((sum, creature) => sum + creature.hp, 0));
    const [first, second] = health as [number, number];
    if (first && second && state.history.length <= MAX_TURNS) return null;
    return first === second ? { kind: 'draw' } : { kind: 'win', seat: first > second ? 0 : 1, reason: 'played' };
  },
  board: (state, viewer) => ({ game: 'creature-duel', ...frameOf(state), guards: state.guards, moves: viewer === state.turn ? state.moves : [] }),
  replay: state => ({ game: 'creature-duel', frames: state.history }),
};

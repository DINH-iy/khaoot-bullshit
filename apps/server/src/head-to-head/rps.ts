import type { z } from 'zod';
import type { RpsPickSchema } from '@party/contracts';
import { illegal, type HeadToHeadRules, type Seat } from './engine.js';

type Pick = z.infer<typeof RpsPickSchema>;
interface Round { picks: [Pick, Pick]; winner: Seat | null }
interface Rps { firstTo: number; picks: [Pick | null, Pick | null]; rounds: Round[] }
const BEATS: Record<Pick, Pick> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const winsOf = (data: Rps): [number, number] => [data.rounds.filter(round => round.winner === 0).length, data.rounds.filter(round => round.winner === 1).length];

/** Rock paper scissors: both pick at once (the other's pick stays hidden until both are in); a tie is played again. */
export const rps: HeadToHeadRules<'rps', Rps> = {
  start: settings => ({ firstTo: settings.firstTo, picks: [null, null], rounds: [] }),
  turn: data => rps.outcome(data) ? null : 'both',
  apply(data, seat, move) {
    illegal(!rps.outcome(data), 'The game is over');
    illegal(data.picks[seat] === null, 'You already picked this round');
    const picks: [Pick | null, Pick | null] = [...data.picks]; picks[seat] = move.pick;
    if (picks[0] === null || picks[1] === null) return { ...data, picks };
    const winner: Seat | null = picks[0] === picks[1] ? null : BEATS[picks[0]] === picks[1] ? 0 : 1;
    return { ...data, picks: [null, null], rounds: [...data.rounds, { picks: [picks[0], picks[1]], winner }] };
  },
  outcome: data => { const wins = winsOf(data); return wins[0] >= data.firstTo ? { kind: 'win', seat: 0, reason: 'played' } : wins[1] >= data.firstTo ? { kind: 'win', seat: 1, reason: 'played' } : null; },
  board: (data, viewer) => ({ game: 'rps', firstTo: data.firstTo, wins: winsOf(data), round: data.rounds.length + 1, picked: [data.picks[0] !== null, data.picks[1] !== null],
    yourPick: viewer === null ? null : data.picks[viewer], last: data.rounds.at(-1) ?? null }),
  replay: data => ({ game: 'rps', rounds: data.rounds }),
};

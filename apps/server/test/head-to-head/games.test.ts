import { describe, expect, it } from 'vitest';
import { HeadToHeadViewSchema, type HeadToHeadMove } from '@party/contracts';
import { IllegalMove } from '../../src/head-to-head/engine.js';
import { matchOutcome, matchView, playMove, resignMatch, startMatch, type MatchState } from '../../src/head-to-head/match.js';

const play = (state: MatchState, moves: [0 | 1, HeadToHeadMove][]) => moves.reduce((current, [seat, move]) => playMove(current, seat, move), state);
const chessMoves = (uci: string[]) => uci.map((move, index) => [index % 2 as 0 | 1, { game: 'chess', from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) } as HeadToHeadMove] as [0 | 1, HeadToHeadMove]);

describe('rock paper scissors', () => {
  it('keeps a pick hidden from the other player until both picked, and replays a tie', () => {
    let state = startMatch('rps', { firstTo: 1 })!;
    state = playMove(state, 0, { game: 'rps', pick: 'rock' });
    const board = (seat: 0 | 1 | null) => matchView(state, seat).board as Extract<ReturnType<typeof matchView>['board'], { game: 'rps' }>;
    expect(board(0).yourPick).toBe('rock'); expect(board(1).yourPick).toBeNull(); expect(board(null).yourPick).toBeNull();
    expect(JSON.stringify(matchView(state, 1))).not.toContain('rock');
    expect(() => playMove(state, 0, { game: 'rps', pick: 'paper' })).toThrow(IllegalMove);
    state = playMove(state, 1, { game: 'rps', pick: 'rock' });
    expect(board(null).last).toEqual({ picks: ['rock', 'rock'], winner: null }); expect(matchOutcome(state)).toBeNull();
    state = play(state, [[0, { game: 'rps', pick: 'paper' }], [1, { game: 'rps', pick: 'scissors' }]]);
    expect(matchOutcome(state)).toEqual({ kind: 'win', seat: 1, reason: 'played' });
    expect(() => playMove(state, 0, { game: 'rps', pick: 'rock' })).toThrow(IllegalMove);
  });
  it('plays to the set number of wins, and refuses settings that do not fit', () => {
    const state = play(startMatch('rps', { firstTo: 2 })!, [[0, { game: 'rps', pick: 'rock' }], [1, { game: 'rps', pick: 'scissors' }]]);
    expect(matchOutcome(state)).toBeNull();
    expect(matchOutcome(play(state, [[1, { game: 'rps', pick: 'paper' }], [0, { game: 'rps', pick: 'scissors' }]]))).toEqual({ kind: 'win', seat: 0, reason: 'played' });
    expect(startMatch('rps', { firstTo: 9 })).toBeNull(); expect(startMatch('rps', { other: 1 })).toBeNull();
  });
});

describe('tic-tac-toe', () => {
  const cell = (index: number): HeadToHeadMove => ({ game: 'tictactoe', cell: index });
  it('takes turns, refuses taken squares, and finds three in a row', () => {
    let state = startMatch('tictactoe', {})!;
    expect(() => playMove(state, 1, cell(0))).toThrow('Not your turn');
    state = play(state, [[0, cell(0)], [1, cell(3)]]);
    expect(() => playMove(state, 0, cell(3))).toThrow('That square is taken');
    state = play(state, [[0, cell(1)], [1, cell(4)], [0, cell(2)]]);
    expect(matchOutcome(state)).toEqual({ kind: 'win', seat: 0, reason: 'played' });
    expect(matchView(state, null)).toMatchObject({ turn: null, board: { line: [0, 1, 2] } });
  });
  it('calls a full board without a line a draw', () => {
    const state = play(startMatch('tictactoe', {})!, [0, 1, 2, 4, 3, 5, 7, 6, 8].map((index, turn) => [turn % 2 as 0 | 1, cell(index)]));
    expect(matchOutcome(state)).toEqual({ kind: 'draw' });
  });
});

describe('chess', () => {
  it('gives only the side to move its legal moves, and refuses moves out of turn or against the rules', () => {
    const state = startMatch('chess', {})!;
    const white = matchView(state, 0).board as Extract<ReturnType<typeof matchView>['board'], { game: 'chess' }>;
    expect(white.legal).toHaveLength(20);
    expect((matchView(state, 1).board as typeof white).legal).toEqual([]);
    expect(() => playMove(state, 1, { game: 'chess', from: 'e7', to: 'e5' })).toThrow('Not your turn');
    expect(() => playMove(state, 0, { game: 'chess', from: 'e2', to: 'e5' })).toThrow('Illegal move');
  });
  it('ends in checkmate (the fool’s mate) with a win for black', () => {
    const state = play(startMatch('chess', {})!, chessMoves(['f2f3', 'e7e5', 'g2g4', 'd8h4']));
    expect(matchOutcome(state)).toEqual({ kind: 'win', seat: 1, reason: 'played' });
    expect(matchView(state, 0)).toMatchObject({ turn: null, board: { check: true, lastMove: { from: 'd8', to: 'h4' } } });
  });
  it('offers promotion as one choice and plays the chosen piece', () => {
    // White's h-pawn runs to h7; it can only promote by taking the knight on g8 (the rook blocks h8).
    const state = play(startMatch('chess', {})!, chessMoves(['h2h4', 'g7g5', 'h4g5', 'h7h6', 'g5h6', 'a7a6', 'h6h7', 'a6a5']));
    const board = matchView(state, 0).board as Extract<ReturnType<typeof matchView>['board'], { game: 'chess' }>;
    expect(board.legal.filter(move => move.from === 'h7')).toEqual([{ from: 'h7', to: 'g8', promotion: true }]);
    const promoted = playMove(state, 0, { game: 'chess', from: 'h7', to: 'g8', promotion: 'n' });
    expect((matchView(promoted, null).board as typeof board).fen.split('/')[0]).toContain('N');
  });
});

describe('every head-to-head match', () => {
  it('can be resigned (the other player wins), and then takes no moves', () => {
    const state = resignMatch(startMatch('tictactoe', {})!, 0);
    expect(matchOutcome(state)).toEqual({ kind: 'win', seat: 1, reason: 'resigned' });
    expect(() => playMove(state, 0, { game: 'tictactoe', cell: 0 })).toThrow(IllegalMove);
    expect(() => resignMatch(state, 1)).toThrow(IllegalMove);
  });
  it('refuses a move meant for another game, and shows views that fit the contract', () => {
    const state = startMatch('rps', {})!;
    expect(() => playMove(state, 0, { game: 'tictactoe', cell: 0 })).toThrow(IllegalMove);
    for (const game of ['rps', 'tictactoe', 'chess'] as const) for (const seat of [0, 1, null] as const) expect(HeadToHeadViewSchema.safeParse(matchView(startMatch(game, {})!, seat)).success).toBe(true);
  });
});

describe('replays', () => {
  it('appear only once a game is over, move by move', () => {
    const cell = (index: number): HeadToHeadMove => ({ game: 'tictactoe', cell: index });
    const half = play(startMatch('tictactoe', {})!, [[0, cell(0)], [1, cell(3)]]);
    expect(matchView(half, 0).replay).toBeNull();
    const done = play(half, [[0, cell(1)], [1, cell(4)], [0, cell(2)]]);
    expect(matchView(done, null).replay).toEqual({ game: 'tictactoe', moves: [0, 3, 1, 4, 2] });
    const rps = play(startMatch('rps', { firstTo: 1 })!, [[0, { game: 'rps', pick: 'rock' }], [1, { game: 'rps', pick: 'rock' }], [0, { game: 'rps', pick: 'paper' }], [1, { game: 'rps', pick: 'rock' }]]);
    expect(matchView(rps, 1).replay).toEqual({ game: 'rps', rounds: [{ picks: ['rock', 'rock'], winner: null }, { picks: ['paper', 'rock'], winner: 0 }] });
    const mate = play(startMatch('chess', {})!, chessMoves(['f2f3', 'e7e5', 'g2g4', 'd8h4']));
    const frames = (matchView(mate, 0).replay as { frames: { from: string | null; to: string | null }[] }).frames;
    expect(frames).toHaveLength(5); expect(frames[0]).toMatchObject({ from: null, to: null }); expect(frames[4]).toMatchObject({ from: 'd8', to: 'h4' });
  });
});

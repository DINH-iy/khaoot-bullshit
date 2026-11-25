import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { busGuessRight, type BusGuess, type PlayingCard } from '@party/contracts';
import { parseDefinition } from '../../../src/game/definition.js';
import { createGameService } from '../../../src/game/service.js';
import { readSessionView } from '../../../src/game/views.js';
import { readMinigameRun } from '../../../src/minigames/shared/rules.js';
import { db, fixture, prisma } from '../game-fixture.js';

afterAll(async () => { await db.close(); });
const game = (stage: Record<string, unknown>) => parseDefinition({ formatVersion: 2, title: 'Step games', startNodeKey: 'mini',
  nodes: [{ key: 'mini', stages: [{ key: 'main', kind: 'minigame', prompt: 'Go!', durationMs: 300_000, ...stage }] }], edges: [] });
// Teams made by the host for this round only: the first `first` players, then the rest.
const inTeams = (first: number) => ({ play: { kind: 'teams', lineup: { kind: 'round', form: { split: { kind: 'sizes', sizes: [first, 'rest'] }, formation: 'host' } }, answers: 'everyone', points: 'team' } });
function world() { let now = Date.now(); return { service: createGameService(prisma, undefined, () => new Date(now)), advance: (ms: number) => { now += ms; } }; }
type World = ReturnType<typeof world>; type Fixture = Awaited<ReturnType<typeof fixture>>;
async function host(w: World, f: Fixture, type: string, extra: Record<string, unknown> = {}) {
  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: f.sessionId } });
  return w.service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, expectedRevision: session.revision, type, ...extra });
}
const move = (w: World, f: Fixture, index: number, stageRunId: string, step: number, option: string, decide?: true) =>
  w.service.execute({ role: 'player', playerId: f.players[index]!.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'minigame.move', stageRunId, step, option, ...(decide ? { decide } : {}) });
// What the server's timer sends when a team vote's time is up (as the host, without a revision).
const decide = (w: World, f: Fixture, stageRunId: string, side: string, step: number) =>
  w.service.execute(f.host, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'minigame.decide', stageRunId, side, step });
const viewOf = (f: Fixture, index: number) => readSessionView(prisma, { role: 'player', playerId: f.players[index]!.id }, f.sessionId);
/** Starts a team round: the host puts the first `first` players in team 0, the rest in team 1, and confirms. */
async function startTeams(w: World, f: Fixture, first: number) {
  const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
  for (const [index, player] of f.players.entries()) await host(w, f, 'teams.assign', { stageRunId, playerId: player.id, teamIndex: index < first ? 0 : 1 });
  await host(w, f, 'teams.confirm', { stageRunId }); w.advance(3500);
  const teamOf = async (index: number) => (await prisma.teamMember.findFirstOrThrow({ where: { playerId: f.players[index]!.id } })).teamId;
  return { stageRunId, teamOf };
}
const runOf = async (stageRunId: string) => readMinigameRun((await prisma.stageRun.findUniqueOrThrow({ where: { id: stageRunId } })).presentation)!;

describe('step games: one engine for games played move by move', () => {
  it('Lucky doors: each player picks a door once; the doors stay secret; the door pays at once', async () => {
    const w = world(); const f = await fixture(2, game({ game: 'lucky-doors', settings: { doorsMilli: ['0', '7000'] } }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!; w.advance(3500);
    const prize = (await runOf(stageRunId)).doorsMilli!.indexOf('7000');
    expect(JSON.stringify((await viewOf(f, 0)).stage!.minigame!.steps)).not.toContain('7000');
    await move(w, f, 0, stageRunId, 0, String(prize));
    await expect(move(w, f, 0, stageRunId, 0, String(1 - prize))).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    await expect(move(w, f, 1, stageRunId, 0, '5')).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    // The old way (a plain answer) is refused for every step game.
    await expect(w.service.execute({ role: 'player', playerId: f.players[1]!.id }, { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'minigame', value: 0 } }))
      .rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    expect(await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId }, select: { recipientPlayerId: true, amountMilli: true } })).toEqual([{ recipientPlayerId: f.players[0]!.id, amountMilli: 7000n }]);
  });

  it('Galgje: everyone guesses the same word; only the side itself sees its letters; fewest wrong letters wins; the word shows at the reveal', async () => {
    const w = world(); const f = await fixture(3, game({ game: 'hangman', settings: { lives: 3, words: ['Fiets'] }, placementMilli: ['10000', '6000'] }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!; w.advance(3500);
    expect((await runOf(stageRunId)).hangmanWord).toBe('fiets');
    const guess = async (index: number, letters: string) => { for (const letter of letters) { const step = (await viewOf(f, index)).stage!.minigame!.steps!.sides.find(side => side.playerId === f.players[index]!.id)!.step; await move(w, f, index, stageRunId, step, letter); } };
    await guess(0, 'fx');
    const mine = (await viewOf(f, 0)).stage!.minigame!;
    // The author's word list never reaches a screen; the own phone sees its letters, another phone only its progress.
    expect(mine.settings).toEqual({ lives: 3 });
    expect(mine.steps!.sides.find(side => side.playerId === f.players[0]!.id)).toMatchObject({ own: { pattern: 'f____', guessed: ['f', 'x'] }, view: { mask: '_____', found: 1, wrong: 1 } });
    const watched = (await viewOf(f, 1)).stage!.minigame!.steps!.sides.find(side => side.playerId === f.players[0]!.id)!;
    expect(watched.own).toBeUndefined(); expect(watched.options).toEqual([]);
    expect(JSON.stringify((await viewOf(f, 1)).stage)).not.toMatch(/fiets|f____/);
    await expect(move(w, f, 0, stageRunId, 2, 'f')).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await guess(0, 'iets'); // found with 1 wrong
    await guess(1, 'abc'); // hanged after 3 wrong letters: no more letters to pick
    await expect(move(w, f, 1, stageRunId, 3, 'd')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    expect((await viewOf(f, 1)).stage!.minigame!.steps!.sides.find(side => side.playerId === f.players[1]!.id)).toMatchObject({ options: null, view: { hanged: true } });
    await guess(2, 'fiets'); // found with none wrong
    await host(w, f, 'stage.close', { stageRunId }); await host(w, f, 'stage.reveal', { stageRunId });
    const reveal = (await viewOf(f, 1)).stage!.reveal!.answer as { word?: string; entries: { playerId: string | null; value: number | null; place: number | null }[] };
    expect(reveal.word).toBe('fiets');
    expect(reveal.entries.map(entry => [entry.playerId, entry.value, entry.place])).toEqual([[f.players[2]!.id, 0, 1], [f.players[0]!.id, 1, 2], [f.players[1]!.id, null, null]]);
  });

  it('Drive the bus: a team guesses its four cards (anyone taps), sees each card only once guessed, and the fewest sips win', async () => {
    const w = world(); const f = await fixture(4, game({ game: 'bus', settings: { sips: [1, 2, 3, 4], rainbow: false }, placementMilli: ['10000'], ...inTeams(2) }));
    const { stageRunId, teamOf } = await startTeams(w, f, 2); const teamA = await teamOf(0); const teamB = await teamOf(2);
    const guesses: Record<string, BusGuess[]> = { [teamA]: ['red', 'higher', 'inside', 'hearts'], [teamB]: ['black', 'lower', 'outside', 'spades'] };
    for (let step = 0; step < 4; step++) {
      // Team A's members take turns tapping; team B's other side can only see A's cards guessed so far.
      await move(w, f, step % 2, stageRunId, step, guesses[teamA]![step]!);
      const seen = (await viewOf(f, 2)).stage!.minigame!.steps!.sides.find(side => side.teamId === teamA)!;
      expect((seen.view as { cards: unknown[] }).cards).toHaveLength(step + 1);
      await move(w, f, 2 + (step % 2), stageRunId, step, guesses[teamB]![step]!);
    }
    await expect(move(w, f, 0, stageRunId, 4, 'red')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    const run = await runOf(stageRunId);
    const sipsOf = (team: string) => { const cards = (run.steps![`team:${team}`]!.state as { cards: PlayingCard[] }).cards;
      return guesses[team]!.reduce((total, guess, round) => total + (busGuessRight(round, guess, cards) ? 0 : round + 1), 0); };
    const view = (await viewOf(f, 0)).stage!.minigame!.steps!;
    expect(view.sides.find(side => side.teamId === teamA)!.result).toBe(sipsOf(teamA));
    await host(w, f, 'stage.close', { stageRunId }); await host(w, f, 'stage.reveal', { stageRunId });
    const paid = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId, recipientTeamId: { not: null } }, select: { recipientTeamId: true } });
    const best = sipsOf(teamA) === sipsOf(teamB) ? [teamA, teamB] : [sipsOf(teamA) < sipsOf(teamB) ? teamA : teamB];
    expect(paid.map(entry => entry.recipientTeamId).sort()).toEqual(best.sort());
  });

  it('a team vote: each member votes once, it waits for the vote time, only the votes cast count, and other teams never see the split', async () => {
    const w = world(); const f = await fixture(4, game({ game: 'bus', decide: 'vote', voteSeconds: 20, ...inTeams(3) }));
    const { stageRunId, teamOf } = await startTeams(w, f, 3); const teamA = await teamOf(0);
    await move(w, f, 0, stageRunId, 0, 'black'); await move(w, f, 1, stageRunId, 0, 'black');
    await expect(move(w, f, 0, stageRunId, 0, 'red')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    // Not everyone voted yet: the step waits. Team A sees its split; team B only who voted.
    const mine = (await viewOf(f, 0)).stage!.minigame!.steps!.sides.find(side => side.teamId === teamA)!;
    expect(mine.step).toBe(0); expect(mine.votes).toEqual([{ option: 'black', count: 2 }]);
    const theirs = (await viewOf(f, 3)).stage!.minigame!.steps!.sides.find(side => side.teamId === teamA)!;
    expect(theirs.votes).toEqual([]); expect(theirs.voters).toHaveLength(2);
    // Before the vote time is up the server cannot decide it; afterwards the two votes cast decide (the third member is not counted).
    await expect(decide(w, f, stageRunId, `team:${teamA}`, 0)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    w.advance(21_000);
    await decide(w, f, stageRunId, `team:${teamA}`, 0);
    const after = (await viewOf(f, 0)).stage!.minigame!.steps!.sides.find(side => side.teamId === teamA)!;
    expect(after.step).toBe(1); expect((after.view as { guesses: string[] }).guesses).toEqual(['black']);
    // "Decide now" by someone who voted counts the votes cast at once.
    await move(w, f, 2, stageRunId, 1, 'lower'); await move(w, f, 2, stageRunId, 1, 'lower', true);
    expect(((await viewOf(f, 0)).stage!.minigame!.steps!.sides.find(side => side.teamId === teamA)!.view as { guesses: string[] }).guesses).toEqual(['black', 'lower']);
  });

  it('the captain decides: a team without one gets one at random, and only the captain may move', async () => {
    const w = world(); const f = await fixture(4, game({ game: 'bus', decide: 'captain', ...inTeams(2) }));
    const { stageRunId, teamOf } = await startTeams(w, f, 2); const teamA = await teamOf(0);
    // The captain is known from the start (a fixed random pick, the team having none), on every screen.
    const captain = (await viewOf(f, 2)).stage!.minigame!.steps!.sides.find(side => side.teamId === teamA)!.captainId;
    expect([f.players[0]!.id, f.players[1]!.id]).toContain(captain);
    const [chosen, other] = captain === f.players[0]!.id ? [0, 1] : [1, 0];
    await expect(move(w, f, other, stageRunId, 0, 'red')).rejects.toMatchObject({ code: 'INELIGIBLE' });
    await move(w, f, chosen, stageRunId, 0, 'red');
    expect((await runOf(stageRunId)).steps![`team:${teamA}`]!.captainId).toBe(captain);
  });

  it('Left or right: the choices stay secret until the reveal; the majority gets the points; a tie gives nobody anything', async () => {
    const w = world(); const f = await fixture(3, game({ game: 'majority', placementMilli: ['5000'] }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!; w.advance(3500);
    await move(w, f, 0, stageRunId, 0, 'left'); await move(w, f, 1, stageRunId, 0, 'left'); await move(w, f, 2, stageRunId, 0, 'right');
    const view = (await viewOf(f, 2)).stage!.minigame!.steps!;
    expect(view.sides.every(side => side.result === null && side.options === null)).toBe(true);
    await host(w, f, 'stage.close', { stageRunId }); await host(w, f, 'stage.reveal', { stageRunId });
    const paid = await prisma.scoreEntry.findMany({ where: { sessionId: f.sessionId }, select: { recipientPlayerId: true, amountMilli: true } });
    expect(paid.map(entry => entry.recipientPlayerId).sort()).toEqual([f.players[0]!.id, f.players[1]!.id].sort());
    expect(paid.every(entry => entry.amountMilli === 5000n)).toBe(true);
    const tie = await fixture(2, game({ game: 'majority' })); const w2 = world();
    const tieRun = (await host(w2, tie, 'session.start')).stageRunId!; w2.advance(3500);
    await move(w2, tie, 0, tieRun, 0, 'left'); await move(w2, tie, 1, tieRun, 0, 'right');
    await host(w2, tie, 'stage.close', { stageRunId: tieRun }); await host(w2, tie, 'stage.reveal', { stageRunId: tieRun });
    expect(await prisma.scoreEntry.count({ where: { sessionId: tie.sessionId } })).toBe(0);
  });
});

describe('Speed run', () => {
  it('protects the countdown and course, retains progress through a pause, and ranks finish times', async () => {
    const w = world(); const f = await fixture(2, game({ game: 'speed-run', settings: {}, placementMilli: ['10000', '6000'] }));
    const stageRunId = (await host(w, f, 'session.start')).stageRunId!;
    await expect(move(w, f, 0, stageRunId, 0, 'down')).rejects.toMatchObject({ code: 'INVALID_STATE' });
    w.advance(3500);
    await expect(move(w, f, 0, stageRunId, 0, 'left')).rejects.toMatchObject({ code: 'INVALID_SUBMISSION' });
    await move(w, f, 0, stageRunId, 0, 'down');
    await expect(move(w, f, 0, stageRunId, 0, 'down')).rejects.toMatchObject({ code: 'ALREADY_SUBMITTED' });
    await host(w, f, 'session.pause');
    w.advance(30_000);
    await host(w, f, 'session.resume');
    w.advance(3500);
    const route = ['down', 'down', 'right', 'right', 'down', 'down', 'right', 'right', 'right', 'right'];
    for (const [step, option] of route.entries()) {
      if (step > 0) await move(w, f, 0, stageRunId, step, option);
      w.advance(150);
    }
    for (const [step, option] of route.entries()) await move(w, f, 1, stageRunId, step, option);
    await host(w, f, 'stage.close', { stageRunId });
    await host(w, f, 'stage.reveal', { stageRunId });
    const answer = (await readSessionView(prisma, f.host, f.sessionId)).stage!.reveal!.answer!;
    expect(answer).toMatchObject({ kind: 'minigame', game: 'speed-run', entries: [
      { playerId: f.players[0]!.id, place: 1, value: 2350 },
      { playerId: f.players[1]!.id, place: 2, value: 2500 },
    ] });
  });
});

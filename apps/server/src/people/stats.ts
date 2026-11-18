import { SubmissionValueSchema, type PersonStats } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import { parseDefinition, type GameDefinition } from '../game/definition.js';
import { locateStage } from '../game/graph.js';
import { earned } from '../game/scoring/place-awards.js';
import { matchOutcome, readMatch } from '../head-to-head/match.js';

// Totals per person for the owner's People page and leaderboard. Everything is read
// from the history the games already keep (seats, score entries, answers, arcade
// results, challenges, side rounds); nothing is stored twice. Practice rooms never count.

const empty = (personId: string): PersonStats => ({ personId, games: 0, wins: 0, podiums: 0, points: 0, right: 0, wrong: 0, minigames: 0,
  arcadeRounds: 0, arcadeWins: 0, duelsWon: 0, duelsLost: 0, duelsDrawn: 0, sideRounds: 0, biggestWin: 0, duelGames: [], rival: null, favouriteGame: null, lastGame: null });

export async function peopleStats(client: PrismaClient, personIds: string[]): Promise<PersonStats[]> {
  const stats = new Map(personIds.map(id => [id, empty(id)]));
  if (!personIds.length) return [];
  const seats = await client.sessionPlayer.findMany({ where: { personId: { in: personIds }, session: { mode: 'LIVE' } }, select: {
    id: true, personId: true, sessionId: true,
    session: { select: { status: true, endedAt: true, gameVersionId: true, arcadeRound: { select: { id: true } }, gameVersion: { select: { game: { select: { title: true } } } } } },
  } });
  const personOf = new Map(seats.map(seat => [seat.id, seat.personId!]));
  // Games: finished rooms, not arcade rounds (those have their own results below).
  const games = seats.filter(seat => !seat.session.arcadeRound);
  const finished = games.filter(seat => seat.session.status === 'FINISHED');

  // Places by own points in each finished game: 1 + the number of players with more. Ties share a place.
  const totals = finished.length ? await client.scoreEntry.groupBy({ by: ['sessionId', 'recipientPlayerId'],
    where: { sessionId: { in: [...new Set(finished.map(seat => seat.sessionId))] }, recipientPlayerId: { not: null } }, _sum: { amountMilli: true } }) : [];
  const bySession = new Map<string, Map<string, bigint>>();
  for (const row of totals) {
    const points = bySession.get(row.sessionId) ?? new Map<string, bigint>(); bySession.set(row.sessionId, points);
    points.set(row.recipientPlayerId!, row._sum.amountMilli ?? 0n);
  }
  const titles = new Map<string, Map<string, number>>();
  for (const seat of finished) {
    const person = stats.get(seat.personId!)!; const points = bySession.get(seat.sessionId) ?? new Map<string, bigint>();
    const mine = points.get(seat.id) ?? 0n; const place = 1 + [...points.values()].filter(other => other > mine).length;
    person.games += 1; person.points += Number(mine / 1000n);
    // Nobody wins a game in which no player scored (a game scored only per team, for example).
    if (mine > 0n) { if (place === 1) person.wins += 1; if (place <= 3) person.podiums += 1; }
    const title = seat.session.gameVersion.game.title;
    const counts = titles.get(person.personId) ?? new Map<string, number>(); titles.set(person.personId, counts); counts.set(title, (counts.get(title) ?? 0) + 1);
    const at = seat.session.endedAt;
    if (at && (!person.lastGame || at.toISOString() > person.lastGame.at)) person.lastGame = { title, at: at.toISOString() };
  }
  for (const [personId, counts] of titles) {
    const [title, times] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]!;
    stats.get(personId)!.favouriteGame = { title, times };
  }

  // Answers in revealed rounds of real games: right or wrong for quiz and ordering rounds; minigames played.
  const answers = games.length ? await client.submission.findMany({ where: { playerId: { in: games.map(seat => seat.id) }, slotKey: 'answer', stage: { revealedAt: { not: null } } },
    select: { playerId: true, value: true, stage: { select: { nodeKey: true, stageKey: true, session: { select: { gameVersionId: true } } } } } }) : [];
  const definitions = new Map<string, GameDefinition | null>();
  const versionIds = [...new Set(answers.map(answer => answer.stage.session.gameVersionId))];
  for (const version of versionIds.length ? await client.gameVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true, definition: true } }) : []) {
    try { definitions.set(version.id, parseDefinition(version.definition)); } catch { definitions.set(version.id, null); }
  }
  for (const answer of answers) {
    const definition = definitions.get(answer.stage.session.gameVersionId); const person = stats.get(personOf.get(answer.playerId!)!);
    const located = definition ? locateStage(definition, answer.stage.nodeKey, answer.stage.stageKey) : null;
    if (!located || !person) continue;
    const stage = located.stage;
    if (stage.kind === 'minigame') { person.minigames += 1; continue; }
    if (stage.kind !== 'collect' || (stage.scoring.kind !== 'correct-choice' && stage.scoring.kind !== 'correct-order')) continue;
    const value = SubmissionValueSchema.safeParse(answer.value);
    if (value.success && earned(stage, value.data)) person.right += 1; else person.wrong += 1;
  }

  // Arcade: rounds played and won (own place or the team's).
  for (const row of await client.arcadeResult.findMany({ where: { personId: { in: personIds } }, select: { personId: true, place: true } })) {
    const person = stats.get(row.personId!)!; person.arcadeRounds += 1; if (row.place === 1) person.arcadeWins += 1;
  }

  // Challenges between two phones, in any room (practice rooms excepted).
  const seatIds = seats.map(seat => seat.id);
  const duels = seatIds.length ? await client.sideChallenge.findMany({ where: { status: 'FINISHED', OR: [{ challengerId: { in: seatIds } }, { opponentId: { in: seatIds } }] },
    select: { game: true, state: true, challenger: { select: { id: true, personId: true, displayName: true } }, opponent: { select: { id: true, personId: true, displayName: true } } } }) : [];
  // Per person: results per game, and per opponent (a person by account, a guest by name) for the main rival.
  const rivals = new Map<string, Map<string, { name: string; personId: string | null; times: number; won: number; lost: number }>>();
  for (const duel of duels) {
    const match = readMatch(duel.state); const outcome = match ? matchOutcome(match) : null; if (!outcome) continue;
    const sides = [duel.challenger, duel.opponent] as const;
    sides.forEach((side, seat) => {
      const person = stats.get(personOf.get(side.id) ?? ''); if (!person) return;
      const result = outcome.kind !== 'win' ? 'drawn' : outcome.seat === seat ? 'won' : 'lost';
      if (result === 'drawn') person.duelsDrawn += 1; else if (result === 'won') person.duelsWon += 1; else person.duelsLost += 1;
      const game = person.duelGames.find(row => row.game === duel.game) ?? (person.duelGames.push({ game: duel.game, won: 0, lost: 0, drawn: 0 }), person.duelGames.at(-1)!);
      game[result] += 1;
      const other = sides[1 - seat]!; const key = other.personId ?? `guest:${other.displayName.toLowerCase()}`;
      const mine = rivals.get(person.personId) ?? new Map(); rivals.set(person.personId, mine);
      const row = mine.get(key) ?? { name: other.displayName, personId: other.personId, times: 0, won: 0, lost: 0 }; mine.set(key, row);
      row.times += 1; if (result === 'won') row.won += 1; if (result === 'lost') row.lost += 1;
    });
  }
  for (const [personId, mine] of rivals) {
    stats.get(personId)!.rival = [...mine.values()].sort((a, b) => b.times - a.times || b.lost - a.lost || a.name.localeCompare(b.name))[0] ?? null;
  }
  for (const person of stats.values()) person.duelGames.sort((a, b) => (b.won + b.lost + b.drawn) - (a.won + a.lost + a.drawn));

  // Solo side games: rounds finished and the biggest win in chips (paid out minus the bet).
  for (const round of await client.sideRound.findMany({ where: { personId: { in: personIds }, finished: true }, select: { personId: true, bet: true, payout: true } })) {
    const person = stats.get(round.personId!)!; person.sideRounds += 1; person.biggestWin = Math.max(person.biggestWin, round.payout - round.bet);
  }
  return [...stats.values()];
}

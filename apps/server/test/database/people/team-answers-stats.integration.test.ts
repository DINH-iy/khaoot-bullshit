import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { parseDefinition } from '../../../src/game/definition.js';
import { peopleStats } from '../../../src/people/stats.js';
import { db, fixture, hostCommand, prisma, service } from '../game-fixture.js';

afterAll(async () => { await db.close(); });
const quiz = { key: 'a', stages: [{ key: 'q', kind: 'collect', prompt: 'Capital?', durationMs: 30_000,
  input: { kind: 'choice', options: [{ key: 'canberra', label: 'Canberra' }, { key: 'sydney', label: 'Sydney' }] },
  scoring: { kind: 'correct-choice', correctChoiceKey: 'canberra', awardMilli: '10000' } }] };
const definition = parseDefinition({ formatVersion: 1, title: 'Team stats', startNodeKey: 'a', nodes: [quiz], edges: [],
  teams: { split: { kind: 'count', teams: 2 }, formation: 'random' }, play: { kind: 'teams', lineup: { kind: 'game' }, answers: 'captain', points: 'team' } });

describe('people stats for team answers', () => {
  it('credit a captain\'s answer to every member of the team, not to players who sat out', async () => {
    const f = await fixture(4, definition);
    const stageRunId = (await hostCommand(f, 'session.start')).stageRunId!;
    const [ann, bo, cy, dee] = f.players.map(player => player.id) as [string, string, string, string];
    for (const [playerId, teamIndex] of [[ann, 0], [bo, 0], [cy, 1], [dee, null]] as const) await hostCommand(f, 'teams.assign', { stageRunId, playerId, teamIndex });
    await hostCommand(f, 'teams.captain', { stageRunId, playerId: bo });
    await hostCommand(f, 'teams.captain', { stageRunId, playerId: cy });
    await hostCommand(f, 'teams.confirm', { stageRunId });
    const submit = (playerId: string, choiceKey: string) => service.execute({ role: 'player', playerId },
      { formatVersion: 1, commandId: randomUUID(), sessionId: f.sessionId, type: 'submission.submit', stageRunId, value: { kind: 'choice', choiceKey } });
    await submit(bo, 'canberra'); await submit(cy, 'sydney');
    await hostCommand(f, 'stage.close', { stageRunId }); await hostCommand(f, 'stage.reveal', { stageRunId }).catch(() => undefined);

    // Stats count real games and people only: make this a real game and give each seat a person.
    await prisma.gameSession.update({ where: { id: f.sessionId }, data: { mode: 'LIVE' } });
    const people: string[] = [];
    for (const playerId of [ann, bo, cy, dee]) {
      const name = `Stats ${randomUUID().slice(0, 8)}`;
      const person = await prisma.person.create({ data: { name, nameKey: name.toLowerCase(), linkHash: randomBytes(32).toString('hex') } });
      await prisma.sessionPlayer.update({ where: { id: playerId }, data: { personId: person.id } });
      people.push(person.id);
    }
    const stats = new Map((await peopleStats(prisma, people)).map(row => [row.personId, row]));
    const tally = (index: number) => { const row = stats.get(people[index]!)!; return { right: row.right, wrong: row.wrong }; };
    expect(tally(0)).toEqual({ right: 1, wrong: 0 }); // a member, not the captain
    expect(tally(1)).toEqual({ right: 1, wrong: 0 }); // the captain
    expect(tally(2)).toEqual({ right: 0, wrong: 1 });
    expect(tally(3)).toEqual({ right: 0, wrong: 0 }); // sat out
  });
});

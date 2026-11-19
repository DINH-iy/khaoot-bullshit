import { ExpectedPeopleSchema, NamePickSchema, SignupSchema } from '@party/contracts';
import type { Config } from '../config.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { authorize, type Transaction } from '../game/model.js';
import { addDevice, createPerson } from '../people/accounts.js';
import { lockRoom, recordRoomChange, type Principal } from './gateway.js';
import { readRoomState, type RoomState } from './reclaim.js';
import { roomAssert } from './security.js';

// People in a room, for players without their personal key at hand:
// - a guest makes their own account while joining, when the host allows it (room setting `signup`);
//   the phone is signed in as the new person and shows the key once;
// - the host adds people to the room; a phone picks one of their names and the host approves
//   it, after which that phone is signed in as that person. Only the phone that asked (it alone
//   knows its request ID) gets the sign-in, once. The host screen shows each added person's key.
// After either, the phone joins the room as usual: as that person.
const REQUEST_MS = 10 * 60 * 1000;
type NameRequest = RoomState['nameRequests'][number];
const live = (state: RoomState, now: number) => state.nameRequests.filter(request => now - Date.parse(request.requestedAt) < REQUEST_MS);
export const pendingNameRequests = (state: RoomState, now = Date.now()) => live(state, now).filter(request => request.status === 'PENDING');

export function createRoomPeople(client: PrismaClient, config: Config) {
  const save = (tx: Transaction, sessionId: string, state: RoomState) => tx.gameSession.update({ where: { id: sessionId }, data: { state: { ...state } } });
  /** An open room by its code (not finished, not an arcade round; practice rooms only outside production). */
  async function openRoom(tx: Transaction, roomCode: string) {
    const room = await tx.gameSession.findUnique({ where: { roomCode }, select: { id: true } }); roomAssert(room, 'ROOM_NOT_AVAILABLE');
    await lockRoom(tx, room.id);
    const session = await tx.gameSession.findUniqueOrThrow({ where: { id: room.id }, select: { id: true, status: true, mode: true, state: true, arcadeRound: { select: { id: true } } } });
    roomAssert(session.status !== 'FINISHED' && !session.arcadeRound && (config.NODE_ENV !== 'production' || session.mode !== 'REHEARSAL'), 'ROOM_NOT_AVAILABLE');
    return { id: session.id, state: readRoomState(session.state) };
  }
  const secret = () => { roomAssert(config.ROOM_TOKEN_SECRET, 'AUTH_UNAVAILABLE'); return config.ROOM_TOKEN_SECRET; };
  const hostRoom = async (tx: Transaction, sessionId: string, principal: Principal) => {
    roomAssert(principal.role === 'host', 'FORBIDDEN');
    await lockRoom(tx, sessionId);
    const session = await tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } }); await authorize(tx, session, principal.actor);
    return readRoomState(session.state);
  };

  return {
    /** What the join screen shows: whether a guest may make an account, and the added people without a seat yet. */
    async joinInfo(sessionId: string, state: RoomState) {
      if (!state.expected.length) return { signup: state.signup, expected: [] };
      const [people, seated] = await Promise.all([
        client.person.findMany({ where: { id: { in: state.expected }, removedAt: null }, select: { id: true, name: true } }),
        client.sessionPlayer.findMany({ where: { sessionId, personId: { in: state.expected } }, select: { personId: true } }),
      ]);
      const taken = new Set(seated.map(seat => seat.personId));
      return { signup: state.signup, expected: people.filter(person => !taken.has(person.id)).sort((a, b) => a.name.localeCompare(b.name)) };
    },
    /** The host's view: the added people (with whether they have a seat) and the phones waiting to sign in as one. */
    async hostView(sessionId: string, state: RoomState) {
      const [people, seated] = state.expected.length ? await Promise.all([
        client.person.findMany({ where: { id: { in: state.expected }, removedAt: null }, select: { id: true, name: true } }),
        client.sessionPlayer.findMany({ where: { sessionId, personId: { in: state.expected }, leftAt: null }, select: { personId: true } }),
      ]) : [[], []];
      const joined = new Set(seated.map(seat => seat.personId)); const order = new Map(state.expected.map((id, index) => [id, index]));
      return {
        expected: people.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map(person => ({ personId: person.id, name: person.name, joined: joined.has(person.id) })),
        nameRequests: pendingNameRequests(state).map(request => ({ requestId: request.id, personId: request.personId, requestedAt: request.requestedAt })),
      };
    },
    /** A guest makes their own account (the room must allow it). Returns the key to show once and the phone's device key. */
    async signup(input: unknown, signedIn: boolean) {
      const parsed = SignupSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      // A phone that already is someone does not make a second account by accident.
      roomAssert(!signedIn, 'INVALID_COMMAND'); const roomSecret = secret();
      return client.$transaction(async tx => {
        const room = await openRoom(tx, parsed.data.roomCode);
        roomAssert(room.state.signup, 'FORBIDDEN');
        const { person, key } = await createPerson(tx, roomSecret, parsed.data.name);
        return { name: person.name, key, device: await addDevice(tx, person.id) };
      });
    },
    /** The host sets the people expected in the room (the whole list; unknown or removed people are left out). */
    async setExpected(sessionId: string, principal: Principal, input: unknown) {
      const parsed = ExpectedPeopleSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      await client.$transaction(async tx => {
        const state = await hostRoom(tx, sessionId, principal);
        const found = new Set((await tx.person.findMany({ where: { id: { in: parsed.data.personIds }, removedAt: null }, select: { id: true } })).map(person => person.id));
        const expected = [...new Set(parsed.data.personIds)].filter(id => found.has(id));
        // Requests for someone no longer on the list are turned down.
        await save(tx, sessionId, { ...state, expected, nameRequests: state.nameRequests.map(request => request.status === 'PENDING' && !found.has(request.personId) ? { ...request, status: 'DENIED' } : request) });
        await recordRoomChange(tx, sessionId, 'room.expected');
      });
    },
    /**
     * A phone asks to sign in as an added person, or checks on its earlier ask (it repeats the same request ID while it
     * waits). Once the host approved, the first check signs this phone in (a device key) and the request is used up.
     */
    async pick(input: unknown) {
      const parsed = NamePickSchema.safeParse(input); roomAssert(parsed.success, 'INVALID_COMMAND');
      const { roomCode, personId, requestId } = parsed.data;
      return client.$transaction(async tx => {
        const room = await openRoom(tx, roomCode); const state = room.state; const now = Date.now();
        roomAssert(!state.bannedPeople.includes(personId), 'SEAT_DENIED');
        const existing = state.nameRequests.find(request => request.id === requestId);
        const mark = (status: NameRequest['status']) => save(tx, room.id, { ...state, nameRequests: state.nameRequests.map(request => request.id === requestId ? { ...request, status } : request) });
        if (existing) {
          roomAssert(existing.personId === personId, 'INVALID_COMMAND');
          if (existing.status === 'APPROVED') {
            const person = await tx.person.findUnique({ where: { id: personId } }); roomAssert(person && !person.removedAt, 'SEAT_UNAVAILABLE');
            await mark('USED');
            return { status: 'approved' as const, name: person.name, device: await addDevice(tx, personId) };
          }
          roomAssert(existing.status === 'PENDING', 'SEAT_DENIED');
          roomAssert(now - Date.parse(existing.requestedAt) < REQUEST_MS, 'SEAT_UNAVAILABLE');
          return { status: 'pending' as const };
        }
        roomAssert(state.expected.includes(personId), 'SEAT_UNAVAILABLE');
        roomAssert(await tx.person.count({ where: { id: personId, removedAt: null } }) === 1, 'SEAT_UNAVAILABLE');
        const kept = live(state, now); roomAssert(kept.filter(request => request.status === 'PENDING').length < 20, 'RATE_LIMITED');
        await save(tx, room.id, { ...state, nameRequests: [...kept, { id: requestId, personId, status: 'PENDING', requestedAt: new Date(now).toISOString() }] });
        await recordRoomChange(tx, room.id, 'name.requested');
        return { status: 'pending' as const };
      });
    },
    /** The host approves or turns down a phone's ask; approving one turns down the others for the same person. */
    async decide(sessionId: string, principal: Principal, requestId: string, approve: boolean) {
      await client.$transaction(async tx => {
        const state = await hostRoom(tx, sessionId, principal);
        const request = pendingNameRequests(state).find(candidate => candidate.id === requestId); roomAssert(request, 'NOT_FOUND');
        await save(tx, sessionId, { ...state, nameRequests: state.nameRequests.map(candidate => candidate.id === requestId ? { ...candidate, status: approve ? 'APPROVED' : 'DENIED' }
          : approve && candidate.personId === request.personId && candidate.status === 'PENDING' ? { ...candidate, status: 'DENIED' } : candidate) });
        await recordRoomChange(tx, sessionId, approve ? 'name.approved' : 'name.denied');
      });
    },
  };
}

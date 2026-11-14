import { createHash } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { Server, Socket } from 'socket.io';
import type { FastifyBaseLogger } from 'fastify';
import { EDITOR_NAMESPACE, EditorJoinSchema, EditorPointSchema, EditorPresenceSchema, GameIdSchema, MAX_EDITORS, type Draft, type EditorPeer, type EditorPresence } from '@party/contracts';
import { RateLimiter } from '../rooms/security.js';
import { clientAddress } from '../client-address.js';

// Editing a game together. Saving stays what it was: whole drafts over HTTP,
// each checked against the revision it was based on. This channel only tells
// the other editors of a game that a newer draft exists (and hands it over),
// and relays who has what selected and where their pointer is.
//
// Access is a short-lived ticket for one game, issued by a signed-in route that
// has already checked the person may edit that game. Who is present lives in
// this process only: nothing here is durable, and a restart just reconnects.
const AUDIENCE = 'party-editor-live';
const TICKET_SECONDS = 120;
const MAX_CONNECTED_MS = 12 * 60 * 60 * 1000;
interface Seat { gameId: string; color: number; presence: EditorPresence }

export function createEditorLive(io: Server, roomSecret: string, log: FastifyBaseLogger, trustCloudflareLocal = false) {
  // Its own key, so a ticket can never stand in for another kind of room credential.
  const key = createHash('sha256').update(`editor-live:${roomSecret}`).digest();
  const editors = io.of(EDITOR_NAMESPACE); const limiter = new RateLimiter(2048);
  const room = (gameId: string) => `game:${gameId}`;
  const seat = (socket: Socket) => socket.data['seat'] as Seat;
  const present = (gameId: string) => [...(editors.adapter.rooms.get(room(gameId)) ?? [])].flatMap(id => { const socket = editors.sockets.get(id); return socket ? [socket] : []; });
  const announce = (gameId: string) => {
    const peers: EditorPeer[] = present(gameId).map(socket => ({ id: socket.id, color: seat(socket).color, ...seat(socket).presence }));
    editors.to(room(gameId)).emit('editor.peers', peers);
  };

  editors.use((socket, next) => {
    void (async () => {
      if (!limiter.allow(`connect:${clientAddress(socket.handshake.address, socket.handshake.headers, trustCloudflareLocal)}`, 120)) throw new Error('Too many connections');
      const join = EditorJoinSchema.parse(socket.handshake.auth);
      const { payload } = await jwtVerify(join.ticket, key, { audience: AUDIENCE, algorithms: ['HS256'], requiredClaims: ['sub', 'exp', 'game'] });
      const gameId = GameIdSchema.parse(payload['game']);
      const taken = new Set(present(gameId).map(peer => seat(peer).color));
      const color = Array.from({ length: MAX_EDITORS }, (_, index) => index).find(index => !taken.has(index));
      if (color === undefined) throw new Error('Game is full');
      socket.data['seat'] = { gameId, color, presence: { name: join.name, view: 'flow', selected: [] } } satisfies Seat;
    })().then(() => next(), () => { log.warn({ event: 'editor_live_rejected' }, 'Editor connection rejected'); next(new Error('Editor access denied')); });
  });
  editors.on('connection', socket => {
    const { gameId } = seat(socket);
    void socket.join(room(gameId)); announce(gameId);
    const expiry = setTimeout(() => socket.disconnect(true), MAX_CONNECTED_MS); expiry.unref();
    socket.on('editor.presence', (input: unknown) => {
      const parsed = EditorPresenceSchema.safeParse(input);
      if (!parsed.success || !limiter.allow(`presence:${socket.id}`, 300)) return;
      seat(socket).presence = parsed.data; announce(gameId);
    });
    // Pointers are a nicety: dropped freely when the network or the sender is too busy.
    socket.on('editor.cursor', (input: unknown) => {
      const parsed = EditorPointSchema.safeParse(input);
      if (!parsed.success || !limiter.allow(`cursor:${socket.id}`, 40, 1000)) return;
      socket.to(room(gameId)).volatile.emit('editor.cursor', { id: socket.id, at: parsed.data });
    });
    socket.on('disconnect', () => { clearTimeout(expiry); announce(gameId); });
  });

  return {
    /** A ticket to join one game's editors. Only call this for someone already allowed to edit that game. */
    ticket: (creatorId: string, gameId: string) => new SignJWT({ game: gameId }).setProtectedHeader({ alg: 'HS256' }).setSubject(creatorId).setAudience(AUDIENCE).setIssuedAt().setExpirationTime(`${TICKET_SECONDS}s`).sign(key),
    /** Hands a newly saved draft to everyone who has the game open. */
    saved: (draft: Draft) => { editors.to(room(draft.gameId)).emit('editor.draft', draft); },
  };
}
export type EditorLive = ReturnType<typeof createEditorLive>;

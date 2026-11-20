import { randomUUID } from 'node:crypto';
import type { ChatMessage, ChatSend } from '@party/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Principal } from './gateway.js';
import { readRoomState } from './reclaim.js';
import { roomAssert } from './security.js';

interface Message { public: ChatMessage; audience?: Set<string>; lineup?: string; expires: number }
interface Chat { messages: Message[]; muted: Set<string> }
const TTL = 30 * 60_000;

/** Live conversations have a bounded replay for reconnects within the life of this server. */
export function createRoomChat(client: PrismaClient) {
  const rooms = new Map<string, Chat>();
  async function access(principal: Principal) {
    const room = await client.gameSession.findUnique({ where: { id: principal.sessionId }, select: { state: true } });
    const config = readRoomState(room?.state);
    roomAssert(room && config.chat && !config.roomClosed && principal.role !== 'display', 'FORBIDDEN');
    const actor = principal.actor.role === 'player' ? principal.actor.playerId : null;
    const host = principal.role === 'host';
    roomAssert(actor || host, 'FORBIDDEN');
    if (!rooms.has(principal.sessionId)) {
      rooms.set(principal.sessionId, { messages: [], muted: new Set() });
      if (rooms.size > 128) rooms.delete(rooms.keys().next().value!);
    }
    const chat = rooms.get(principal.sessionId)!;
    chat.messages = chat.messages.filter(message => message.expires > Date.now());
    return { actor, host, chat };
  }

  async function team(sessionId: string, playerId: string) {
    const active = await client.stageRun.findFirst({ where: { sessionId, status: 'ACTIVE', lineupId: { not: null } }, select: { lineupId: true } });
    const lineup = active?.lineupId ?? (await client.teamLineup.findFirst({
      where: { sessionId, carryover: { path: ['scope'], equals: 'game' } }, orderBy: { number: 'desc' }, select: { id: true },
    }))?.id;
    if (!lineup) return null;
    const member = await client.teamMember.findFirst({ where: { lineupId: lineup, playerId }, select: { teamId: true } });
    return member ? { lineup, teamId: member.teamId } : null;
  }
  function visible(message: Message, actor: string | null, host: boolean, lineup: string | undefined) {
    if (host) return message.public.channel === 'room' || Boolean(message.public.reported);
    return actor !== null && (!message.audience || message.audience.has(actor))
      && (message.lineup === undefined || message.lineup === lineup);
  }
  return {
    async read(principal: Principal) {
      const { actor, host, chat } = await access(principal);
      const membership = actor ? await team(principal.sessionId, actor) : null;
      return {
        messages: chat.messages.filter(message => visible(message, actor, host, membership?.lineup)).map(message => {
          const { reported, ...entry } = message.public;
          return host && reported ? { ...entry, reported } : entry;
        }),
        canTeam: Boolean(membership), muted: host ? [...chat.muted] : actor && chat.muted.has(actor) ? [actor] : [],
      };
    },
    async send(principal: Principal, input: ChatSend) {
      const { actor, chat } = await access(principal);
      roomAssert(actor && !chat.muted.has(actor), 'FORBIDDEN');
      const player = await client.sessionPlayer.findFirst({ where: { id: actor, sessionId: principal.sessionId }, select: { displayName: true } });
      roomAssert(player, 'FORBIDDEN');
      let audience: Set<string> | undefined;
      let lineup: string | undefined;
      if (input.channel === 'private') {
        const recipient = await client.sessionPlayer.findFirst({ where: { id: input.recipientId, sessionId: principal.sessionId, leftAt: null }, select: { id: true } });
        roomAssert(recipient && recipient.id !== actor, 'FORBIDDEN');
        audience = new Set([actor, recipient.id]);
      }
      if (input.channel === 'team') {
        const membership = await team(principal.sessionId, actor);
        roomAssert(membership, 'FORBIDDEN');
        lineup = membership.lineup;
        const members = await client.teamMember.findMany({ where: { lineupId: lineup, teamId: membership.teamId }, select: { playerId: true } });
        audience = new Set(members.map(member => member.playerId));
      }
      const now = Date.now();
      roomAssert(!chat.muted.has(actor), 'FORBIDDEN');
      roomAssert(chat.messages.filter(message => message.expires > now + TTL - 1000).length < 10 &&
        chat.messages.filter(message => message.public.from === actor && message.expires > now + TTL - 10_000).length < 5, 'RATE_LIMITED');
      chat.messages.push({
        public: { id: randomUUID(), from: actor, name: player.displayName, channel: input.channel, text: input.text,
          at: new Date(now).toISOString(), ...(input.channel === 'private' ? { recipientId: input.recipientId } : {}) },
        ...(audience ? { audience } : {}), ...(lineup ? { lineup } : {}), expires: now + TTL,
      });
      chat.messages = chat.messages.slice(-100);
    },
    async report(principal: Principal, messageId: string) {
      const { actor, chat } = await access(principal);
      const message = chat.messages.find(entry => entry.public.id === messageId);
      roomAssert(actor && message && message.public.from !== actor, 'FORBIDDEN');
      const membership = message.lineup ? await team(principal.sessionId, actor) : null;
      roomAssert(visible(message, actor, false, membership?.lineup), 'FORBIDDEN');
      message.public.reported = true;
    },
    async quote(principal: Principal, messageId: string) {
      const { host, chat } = await access(principal);
      const message = chat.messages.find(entry => entry.public.id === messageId);
      roomAssert(host && message?.public.channel === 'room', 'FORBIDDEN');
      return message.public;
    },
    async mute(principal: Principal, playerId: string, muted: boolean) {
      const { host, chat } = await access(principal);
      roomAssert(host && await client.sessionPlayer.count({ where: { id: playerId, sessionId: principal.sessionId } }) === 1, 'FORBIDDEN');
      if (muted) chat.muted.add(playerId); else chat.muted.delete(playerId);
    },
    clear(sessionId: string) { rooms.delete(sessionId); },
  };
}

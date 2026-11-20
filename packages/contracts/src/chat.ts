import { z } from 'zod';

export const ChatSendSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('room'), text: z.string().trim().min(1).max(240) }).strict(),
  z.object({ channel: z.literal('team'), text: z.string().trim().min(1).max(240) }).strict(),
  z.object({ channel: z.literal('private'), recipientId: z.uuid(), text: z.string().trim().min(1).max(240) }).strict(),
]);
export type ChatSend = z.infer<typeof ChatSendSchema>;
export const ChatModerationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('report'), messageId: z.uuid() }).strict(),
  z.object({ action: z.literal('show'), messageId: z.uuid() }).strict(),
  z.object({ action: z.literal('mute'), playerId: z.uuid(), muted: z.boolean() }).strict(),
]);
const ChatMessageSchema = z.object({
  id: z.uuid(), from: z.uuid(), name: z.string().max(40), channel: z.enum(['room', 'team', 'private']),
  text: z.string().max(240), at: z.iso.datetime(), recipientId: z.uuid().optional(), reported: z.literal(true).optional(),
}).strict();
export const ChatViewSchema = z.object({
  messages: z.array(ChatMessageSchema).max(100), canTeam: z.boolean(), muted: z.array(z.uuid()),
}).strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

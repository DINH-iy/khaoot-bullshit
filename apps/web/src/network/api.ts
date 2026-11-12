import type { RoomReply } from '@party/contracts';
export async function roomApi<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'x-party-request': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
    const reply = await response.json() as RoomReply<T>;
    if (!reply.ok) throw new Error(reply.error.code); return reply.data;
  } finally { clearTimeout(timeout); }
}
export function newId() { return crypto.randomUUID(); }

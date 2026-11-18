import type { FastifyInstance } from 'fastify';

// Test seats: the test bench shows several phones next to the host screen, in one browser. A browser keeps one
// cookie per name, so those phones would all be the same player. A phone on the bench sends its seat number
// (1–16) with every request and with its live connection: the server then reads that seat's own cookies
// (`party_…_seat3`) as if they were the usual ones, ignores the others (so a seat is never the host, the owner
// or someone signed in), and stores the cookies it sets under the seat's name. Credentials are checked exactly
// as for a real phone; the seat only picks which of the browser's own cookies is read, so it gives no access
// that browser did not have (anyone can already be several players with several browsers), and other sites
// cannot send it (origin check). Still, a seat may only join a room whose host allows test bench phones.

export const SEAT_HEADER = 'x-party-seat';
const SEAT = /^(?:[1-9]|1[0-6])$/;
/** The seat a request or connection asks for, or null (also when it is not a valid seat). */
export const seatOf = (value: unknown): string | null => typeof value === 'string' && SEAT.test(value) ? value : typeof value === 'number' && SEAT.test(String(value)) ? String(value) : null;

/** The cookie header a seat sees: its own `party_…_seatN` cookies under their usual names, no other `party_…` cookie. */
export function seatCookies(header: string | undefined, seat: string): string {
  const suffix = `_seat${seat}`; const kept: string[] = [];
  for (const part of (header ?? '').split(';').map(value => value.trim()).filter(Boolean)) {
    const at = part.indexOf('='); const name = at < 0 ? part : part.slice(0, at);
    if (!name.startsWith('party_')) kept.push(part);
    else if (name.endsWith(suffix)) kept.push(`${name.slice(0, -suffix.length)}${part.slice(name.length)}`);
  }
  return kept.join('; ');
}
/** A `set-cookie` value for a seat: `party_…` cookies get the seat's name. */
export const seatSetCookie = (value: string, seat: string) => value.replace(/^(party_[A-Za-z0-9_]+?)=/, `$1_seat${seat}=`);

export function registerTestSeats(app: FastifyInstance) {
  app.addHook('onRequest', async request => {
    const seat = seatOf(request.headers[SEAT_HEADER]); if (!seat) return;
    request.headers.cookie = seatCookies(request.headers.cookie, seat);
  });
  app.addHook('onSend', async (request, reply, payload) => {
    const seat = seatOf(request.headers[SEAT_HEADER]); if (!seat) return payload;
    const set = reply.getHeader('set-cookie'); if (set === undefined) return payload;
    // Fastify adds to an existing set-cookie header instead of replacing it: remove the original first, or the
    // seat's cookie would also be stored under the usual name (and replace the host's own).
    reply.removeHeader('set-cookie');
    reply.header('set-cookie', Array.isArray(set) ? set.map(value => seatSetCookie(String(value), seat)) : seatSetCookie(String(set), seat));
    return payload;
  });
}
/** The cookie header of a live connection, for its seat (unchanged without one). */
export const connectionCookies = (header: string | undefined, seat: unknown) => {
  const chosen = seatOf(seat);
  return chosen ? seatCookies(header, chosen) : header;
};

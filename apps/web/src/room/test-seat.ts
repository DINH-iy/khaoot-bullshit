// A phone on the test bench (several phones next to the host screen, in one browser) has a seat: its frame is
// named `party-seat-3`. The seat goes with every request and the live connection, so the server keeps this phone's
// cookies apart from the others' (server: rooms/test-seats.ts; outside production only). Elsewhere it is null.
const match = /^party-seat-(\d{1,2})$/.exec(typeof window === 'undefined' ? '' : window.name);
export const testSeat: number | null = match && Number(match[1]) >= 1 && Number(match[1]) <= 16 ? Number(match[1]) : null;
/** The header to add to a request from this phone (nothing outside the test bench). */
export const seatHeaders = (): Record<string, string> => testSeat ? { 'x-party-seat': String(testSeat) } : {};

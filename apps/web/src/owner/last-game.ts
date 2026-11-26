// The last game opened in the editor on this browser, so the top bar's Editor goes straight back to it.
// A convenience only: kept in this browser, and the editor checks access as always.
const KEY = 'party.lastEditedGame';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lastEditedGame(): string | null {
  try { const value = localStorage.getItem(KEY); return value && ID.test(value) ? value : null; } catch { return null; }
}
export function rememberEditedGame(gameId: string) {
  try { localStorage.setItem(KEY, gameId); } catch { /* private window: the Editor link stays gray */ }
}
/** A game that cannot be opened (any more) is forgotten, so the link never leads to an error. */
export function forgetEditedGame(gameId: string) {
  try { if (localStorage.getItem(KEY) === gameId) localStorage.removeItem(KEY); } catch { /* nothing kept */ }
}

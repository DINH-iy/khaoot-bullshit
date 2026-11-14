// What this browser remembers about the owner, for the player screen. Only a
// "has signed in here before" hint: never the key, and never proof of anything.
// The server decides who is the owner, from the HttpOnly cookie on /api/host.
const SEEN = 'party.ownerBrowser';

export function rememberOwner(signedIn: boolean) {
  try { if (signedIn) localStorage.setItem(SEEN, '1'); else localStorage.removeItem(SEEN); } catch { /* private window: no hint */ }
}
export function wasOwner() {
  try { return localStorage.getItem(SEEN) === '1'; } catch { return false; }
}

/** Shown when an owner page is opened in a browser that is not signed in. Says nothing about the key. */
export const SIGNED_OUT_TEXT = 'This browser is not signed in as the owner. Open your private owner link once in this browser to sign in, then come back here.';

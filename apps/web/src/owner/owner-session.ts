export const isLocalOwnerPage = () => ['localhost', '127.0.0.1'].includes(location.hostname);

/** Shown when an owner or editor page is opened in a browser that is not signed in. Says nothing about any key. */
export const SIGNED_OUT_TEXT = 'This browser is not signed in as the owner or an editor. Open your private owner link once in this browser, or, with editor rights, enter your personal key on the start page. Then come back here.';

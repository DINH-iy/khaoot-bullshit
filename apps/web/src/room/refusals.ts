import { translate } from '../i18n/texts.js';
import { ROOM_TEXTS } from './room.text.js';

const r = (key: keyof typeof ROOM_TEXTS.en) => translate(ROOM_TEXTS, key);

// What a refused action says on the phone: never the server's code itself (that goes to the device log).
const REFUSALS: Partial<Record<string, keyof typeof ROOM_TEXTS.en>> = {
  TOO_LATE: 'tooLate', REVISION_CONFLICT: 'changedBefore', INVALID_STATE: 'eChanged', ALREADY_SUBMITTED: 'eAlready', COMMAND_KEY_REUSED: 'eAlready',
  ALREADY_JUDGED: 'eJudged', INELIGIBLE: 'eNotYou', FORBIDDEN: 'eNotYou', INVALID_SUBMISSION: 'eNotAllowed', INVALID_COMMAND: 'eNotAllowed',
  ALREADY_DECIDED: 'eDecided', DECISION_PENDING: 'eDeciding', NOT_FOUND: 'eGone', GAME_UNAVAILABLE: 'eUnavailable', RATE_LIMITED: 'eBusy',
  UNAUTHORIZED: 'eSignIn', CREDENTIAL_EXPIRED: 'eSignIn', ROOM_NOT_AVAILABLE: 'eRoomGone',
};
/** A readable message for a failed request: a known code's text, a general one for any other code, or the error's own words. */
export function refusalText(error: unknown, fallback: keyof typeof ROOM_TEXTS.en): string {
  if (!(error instanceof Error)) return r(fallback);
  const known = REFUSALS[error.message]; if (known) return r(known);
  return /^[A-Z][A-Z0-9_]*$/.test(error.message) ? r('eFailed') : error.message;
}

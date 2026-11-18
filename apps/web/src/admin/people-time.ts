/**
 * Dates on the admin pages: always a 24-hour clock, and close dates in words
 * ("Today 21:04", "Yesterday 09:30", "Mon 16 Nov 21:04"), older ones with the date.
 */
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const full = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'medium', hourCycle: 'h23' });

const startOfDay = (moment: Date) => new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();
const DAY = 24 * 60 * 60 * 1000;

/** A short moment for a table cell; `now` is passed in by tests. */
export function shortMoment(iso: string, now = new Date()): string {
  const moment = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(moment)) / DAY);
  if (days === 0) return `Today ${clock.format(moment)}`;
  if (days === 1) return `Yesterday ${clock.format(moment)}`;
  if (days > 1 && days < 7) return `${weekday.format(moment)} ${clock.format(moment)}`;
  return `${date.format(moment)} ${clock.format(moment)}`;
}
/** The whole moment, for a tooltip. */
export const fullMoment = (iso: string) => full.format(new Date(iso));
/** Seen within the last 7 days. */
export const seenThisWeek = (iso: string | null, now = new Date()) => iso !== null && now.getTime() - new Date(iso).getTime() < 7 * DAY;

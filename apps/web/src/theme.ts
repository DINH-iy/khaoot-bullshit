/**
 * Light or dark for the organiser's pages (editor, host and admin menus), chosen in the
 * editor's ☰ menu and remembered in this browser. Without a choice the device decides.
 * The colours use light-dark(): applyTheme sets the root's color-scheme (and the build's helper variables).
 */
export type Theme = 'light' | 'dark';
const KEY = 'party.theme';

export function storedTheme(): Theme | null {
  try { const value = localStorage.getItem(KEY); return value === 'light' || value === 'dark' ? value : null; } catch { return null; }
}
/** The theme in use now: the chosen one, or the device's. */
export function currentTheme(): Theme {
  return storedTheme() ?? (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
export function applyTheme(theme: Theme | null = storedTheme()) {
  const root = document.documentElement.style;
  root.colorScheme = theme ?? '';
  // The build rewrites light-dark() for older browsers into two helper variables that follow the device's
  // setting (@media prefers-color-scheme), not color-scheme. Setting them here makes a chosen theme win there too;
  // without a choice they are removed and the device decides again.
  if (theme) { root.setProperty('--lightningcss-light', theme === 'light' ? 'initial' : ' '); root.setProperty('--lightningcss-dark', theme === 'dark' ? 'initial' : ' '); }
  else { root.removeProperty('--lightningcss-light'); root.removeProperty('--lightningcss-dark'); }
}
export function chooseTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* not remembered, still applied */ }
  applyTheme(theme);
}

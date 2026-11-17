/**
 * Light or dark for the organiser's pages (editor, host and admin menus), chosen in the
 * editor's ☰ menu and remembered in this browser. Without a choice the device decides.
 * The colours use light-dark(), so setting the root's color-scheme is all it takes.
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
  document.documentElement.style.colorScheme = theme ?? '';
}
export function chooseTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* not remembered, still applied */ }
  applyTheme(theme);
}

/** Two looks: the default parchment scroll and the dark "dungeon" alternative. The choice is remembered per browser. */
export type Theme = 'parchment' | 'dungeon';

export const THEME_KEY = 'mealprepper-theme';

/** colour of the browser bar on phones, matching the header */
const BAR_COLOR: Record<Theme, string> = { parchment: '#2a1a10', dungeon: '#0b0d12' };

export function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dungeon' ? 'dungeon' : 'parchment';
  } catch {
    return 'parchment'; // storage blocked (private window, cleared site data)
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* the theme still applies for this visit */
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
}

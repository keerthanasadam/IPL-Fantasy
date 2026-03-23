export type Theme = 'dark' | 'light';

const THEME_KEY = 'ipl-theme';

export function getTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) || 'dark';
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }));
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Call once on app startup to apply the saved (or default) theme. */
export function initTheme() {
  document.documentElement.setAttribute('data-theme', getTheme());
}

// ==================== THEME ====================
const THEME_KEY = 'wuwa_matrix_theme_v1';

function readStorage(key) {
  return WUWA_STORAGE.read(key);
}

function writeStorage(key, value) {
  return WUWA_STORAGE.write(key, value);
}

function initTheme() {
  const saved = readStorage(THEME_KEY);
  let theme;
  if (saved === 'dark' || saved === 'light') {
    theme = saved;
  } else {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : '';
}

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next === 'dark' ? 'dark' : '';
  writeStorage(THEME_KEY, next);
  if (window._themedBackgroundRestart) _themedBackgroundRestart();
}

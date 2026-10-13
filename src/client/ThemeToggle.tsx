import { useEffect, useState } from 'react';
import { applyTheme, readStoredTheme, storeTheme, type Theme } from './theme';

/** Switch between the parchment look and the dark dungeon look; an on/off switch named "Dungeon mode". */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => applyTheme(theme), [theme]);

  function toggle() {
    const next: Theme = theme === 'dungeon' ? 'parchment' : 'dungeon';
    storeTheme(next);
    setTheme(next);
  }

  return (
    <button type="button" className="theme-toggle" aria-pressed={theme === 'dungeon'} onClick={toggle}>
      Dungeon mode
    </button>
  );
}

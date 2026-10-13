// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';
import { THEME_KEY } from './theme';

const root = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  delete root().dataset.theme;
  document.head.innerHTML = '<meta name="theme-color" content="#2a1a10" />';
});
afterEach(() => vi.restoreAllMocks());

describe('ThemeToggle (dungeon mode)', () => {
  it('starts in the parchment theme and offers "Dungeon mode" as an off switch', () => {
    render(<ThemeToggle />);
    expect(root().dataset.theme).toBe('parchment');
    expect(screen.getByRole('button', { name: 'Dungeon mode' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to the dungeon theme, remembers it and switches back', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const toggle = screen.getByRole('button', { name: 'Dungeon mode' });

    await user.click(toggle);
    expect(root().dataset.theme).toBe('dungeon');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(THEME_KEY)).toBe('dungeon');

    await user.click(toggle);
    expect(root().dataset.theme).toBe('parchment');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(THEME_KEY)).toBe('parchment');
  });

  it('starts in the dungeon theme when it was chosen before', () => {
    localStorage.setItem(THEME_KEY, 'dungeon');
    render(<ThemeToggle />);
    expect(root().dataset.theme).toBe('dungeon');
    expect(screen.getByRole('button', { name: 'Dungeon mode' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores unknown stored values', () => {
    localStorage.setItem(THEME_KEY, 'neon');
    render(<ThemeToggle />);
    expect(root().dataset.theme).toBe('parchment');
  });

  it('colours the browser bar to match the theme', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const color = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content');
    const parchment = color();
    await user.click(screen.getByRole('button', { name: 'Dungeon mode' }));
    expect(color()).not.toBe(parchment);
  });

  it('still works when the browser storage is not available (private window, blocked data)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup();
    render(<ThemeToggle />);
    expect(root().dataset.theme).toBe('parchment');
    await user.click(screen.getByRole('button', { name: 'Dungeon mode' }));
    expect(root().dataset.theme).toBe('dungeon');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShoppingActions } from '../../src/client/plan/ShoppingActions';

const entries = [
  { name: 'Flour', quantity: 1.5, unit: 'kg' as const },
  { name: 'Onion', quantity: 3, unit: 'piece' as const },
];

let writeText: ReturnType<typeof vi.fn>;

/** user-event installs its own clipboard stub on setup(), so our mock is defined after it. */
function setup() {
  const user = userEvent.setup();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return user;
}

beforeEach(() => {
  window.print = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('ShoppingActions (T-13, AC-22)', () => {
  it('"Copy as text" writes the formatted text to the clipboard and shows "Copied"', async () => {
    const user = setup();
    render(<ShoppingActions entries={entries} />);
    await user.click(screen.getByRole('button', { name: 'Copy as text' }));
    expect(writeText).toHaveBeenCalledWith('1.5 kg Flour\n3 piece Onion');
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  });

  it('a clipboard rejection shows "Copy failed" without crashing', async () => {
    const user = setup();
    writeText.mockRejectedValue(new Error('denied'));
    render(<ShoppingActions entries={entries} />);
    await user.click(screen.getByRole('button', { name: 'Copy as text' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Copy failed');
  });

  it('"Print" calls window.print', async () => {
    const user = setup();
    render(<ShoppingActions entries={entries} />);
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});

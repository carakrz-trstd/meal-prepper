// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast, type ToastOptions } from './toast';

let show!: (o: ToastOptions) => void;
function Probe() {
  show = useToast().show;
  return null;
}
const setup = (durationMs?: number) =>
  render(
    <ToastProvider defaultDurationMs={durationMs}>
      <Probe />
    </ToastProvider>,
  );

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('toasts', () => {
  it('shows a message in a polite live region that is neither a "status" nor an "alert" role', () => {
    setup();
    act(() => show({ message: 'Soup planned for Wednesday' }));
    expect(screen.getByText('Soup planned for Wednesday')).toBeInTheDocument();
    expect(document.querySelector('.toasts')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('an action button (Undo) runs the action once and dismisses the toast', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();
    const onAction = vi.fn();
    act(() => show({ message: 'Removed', actionLabel: 'Undo', onAction }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Removed')).not.toBeInTheDocument();
  });

  it('disappears by itself after the duration (8 seconds by default)', () => {
    setup();
    act(() => show({ message: 'Planned' }));
    act(() => { vi.advanceTimersByTime(7_900); });
    expect(screen.getByText('Planned')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('Planned')).not.toBeInTheDocument();
  });

  it('a custom duration per toast and per provider is honoured', () => {
    setup(1000);
    act(() => show({ message: 'Provider default' }));
    act(() => show({ message: 'Long one', durationMs: 5000 }));
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.queryByText('Provider default')).not.toBeInTheDocument();
    expect(screen.getByText('Long one')).toBeInTheDocument();
  });

  it('can be dismissed by hand', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();
    act(() => show({ message: 'Hello' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Hello')).not.toBeInTheDocument();
  });

  it('stays while the pointer is over it, then leaves (so the Undo button cannot vanish under the cursor)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();
    act(() => show({ message: 'Hover me', actionLabel: 'Undo', onAction: () => {} }));
    await user.hover(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getByText('Hover me')).toBeInTheDocument();
    await user.unhover(screen.getByText('Hover me'));
    act(() => { vi.advanceTimersByTime(8_100); });
    expect(screen.queryByText('Hover me')).not.toBeInTheDocument();
  });

  it('keeps at most three toasts, the newest ones', () => {
    setup();
    act(() => { for (const n of ['one', 'two', 'three', 'four']) show({ message: n }); });
    expect(screen.queryByText('one')).not.toBeInTheDocument();
    for (const n of ['two', 'three', 'four']) expect(screen.getByText(n)).toBeInTheDocument();
  });

  it('an action that fails does not break the page, and the toast is still dismissed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    setup();
    act(() => show({ message: 'Oops', actionLabel: 'Undo', onAction: () => Promise.reject(new Error('nope')) }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByText('Oops')).not.toBeInTheDocument();
  });

  it('useToast works without a provider (components stay usable in isolation)', () => {
    function Lonely() {
      useToast().show({ message: 'ignored' });
      return <p>fine</p>;
    }
    render(<Lonely />);
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});

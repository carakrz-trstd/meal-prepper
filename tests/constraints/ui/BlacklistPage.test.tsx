// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlacklistPage } from '../../../src/client/constraints/BlacklistPage';

vi.mock('../../../src/client/constraints/constraintsApi', () => ({
  constraintsApi: { listBlacklist: vi.fn(), addBlacklist: vi.fn(), removeBlacklist: vi.fn() },
}));
import { constraintsApi } from '../../../src/client/constraints/constraintsApi';
const api = vi.mocked(constraintsApi, true);

beforeEach(() => {
  vi.resetAllMocks();
  api.listBlacklist.mockResolvedValue([{ id: 1, term: 'milk' }]);
});

describe('BlacklistPage (T-6, AC-6)', () => {
  it('lists the blacklisted ingredients', async () => {
    render(<BlacklistPage />);
    expect(await screen.findByText('milk')).toBeInTheDocument();
  });

  it('adds an item and shows the stored (normalised) term', async () => {
    api.addBlacklist.mockResolvedValue({ id: 2, term: 'nuts' });
    const user = userEvent.setup();
    render(<BlacklistPage />);
    await screen.findByText('milk');
    await user.type(screen.getByLabelText('Ingredient'), ' Nuts ');
    await user.click(screen.getByRole('button', { name: 'Add to blacklist' }));
    expect(api.addBlacklist).toHaveBeenCalledWith('Nuts');
    expect(await screen.findByText('nuts')).toBeInTheDocument();
    expect(screen.getByLabelText('Ingredient')).toHaveValue('');
  });

  it('does not add the same term twice in the list', async () => {
    api.addBlacklist.mockResolvedValue({ id: 1, term: 'milk' });
    const user = userEvent.setup();
    render(<BlacklistPage />);
    await screen.findByText('milk');
    await user.type(screen.getByLabelText('Ingredient'), 'MILK');
    await user.click(screen.getByRole('button', { name: 'Add to blacklist' }));
    await waitFor(() => expect(api.addBlacklist).toHaveBeenCalled());
    expect(screen.getAllByText('milk')).toHaveLength(1);
  });

  it('refuses an empty input without calling the API', async () => {
    const user = userEvent.setup();
    render(<BlacklistPage />);
    await screen.findByText('milk');
    await user.click(screen.getByRole('button', { name: 'Add to blacklist' }));
    expect(api.addBlacklist).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/enter an ingredient/i);
  });

  it('removes an item', async () => {
    api.removeBlacklist.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BlacklistPage />);
    await user.click(await screen.findByRole('button', { name: 'Remove milk' }));
    expect(api.removeBlacklist).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByText('milk')).not.toBeInTheDocument());
  });

  it('shows an empty state', async () => {
    api.listBlacklist.mockResolvedValue([]);
    render(<BlacklistPage />);
    expect(await screen.findByText(/nothing is blacklisted/i)).toBeInTheDocument();
  });
});

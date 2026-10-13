// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParticipantsPage } from '../../../src/client/constraints/ParticipantsPage';
import { anna, ben } from './fixtures';

vi.mock('../../../src/client/constraints/constraintsApi', () => ({
  constraintsApi: { listParticipants: vi.fn(), createParticipant: vi.fn(), updateParticipant: vi.fn(), deleteParticipant: vi.fn() },
}));
import { constraintsApi } from '../../../src/client/constraints/constraintsApi';
const api = vi.mocked(constraintsApi, true);

const SIX = ['vegetarian', 'vegan', 'gluten-free', 'lactose-free', 'nut-free', 'seafood-free'];

beforeEach(() => {
  vi.resetAllMocks();
  api.listParticipants.mockResolvedValue([anna]);
});

describe('ParticipantsPage (T-5, AC-7, AC-20)', () => {
  it('offers only the six predefined restrictions as checkboxes in the add form', async () => {
    render(<ParticipantsPage />);
    await screen.findByText('Anna');
    const form = screen.getByRole('form', { name: 'Add participant' });
    expect(within(form).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? (c as HTMLInputElement).labels?.[0]?.textContent)).toEqual(SIX);
  });

  it('lists the saved participants with their restrictions', async () => {
    render(<ParticipantsPage />);
    const row = await screen.findByTestId('participant-Anna');
    expect(row).toHaveTextContent('vegetarian');
  });

  it('adds a participant with the chosen restrictions and shows it', async () => {
    api.createParticipant.mockResolvedValue({ kind: 'ok', participant: ben });
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText('Anna');
    const form = screen.getByRole('form', { name: 'Add participant' });
    await user.type(within(form).getByLabelText('Name'), 'Ben');
    await user.click(within(form).getByLabelText('gluten-free'));
    await user.click(within(form).getByRole('button', { name: 'Add participant' }));
    expect(api.createParticipant).toHaveBeenCalledWith('Ben', ['gluten-free']);
    expect(await screen.findByTestId('participant-Ben')).toBeInTheDocument();
    expect(within(form).getByLabelText('Name')).toHaveValue('');
  });

  it('refuses an empty name without calling the API', async () => {
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await screen.findByText('Anna');
    await user.click(screen.getByRole('button', { name: 'Add participant' }));
    expect(api.createParticipant).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i);
  });

  it('edits a participant: add nut-free and save', async () => {
    api.updateParticipant.mockResolvedValue({ kind: 'ok', participant: { ...anna, restrictions: ['nut-free', 'vegetarian'] } });
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit Anna' }));
    const row = screen.getByTestId('participant-Anna');
    expect(within(row).getByLabelText('vegetarian')).toBeChecked();
    await user.click(within(row).getByLabelText('nut-free'));
    await user.click(within(row).getByRole('button', { name: 'Save participant' }));
    expect(api.updateParticipant).toHaveBeenCalledWith(1, 'Anna', ['vegetarian', 'nut-free']);
    await waitFor(() => expect(screen.getByTestId('participant-Anna')).toHaveTextContent('nut-free'));
  });

  it('removes a participant', async () => {
    api.deleteParticipant.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ParticipantsPage />);
    await user.click(await screen.findByRole('button', { name: 'Remove Anna' }));
    expect(api.deleteParticipant).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByTestId('participant-Anna')).not.toBeInTheDocument());
  });

  it('shows an empty state and API errors', async () => {
    api.listParticipants.mockResolvedValue([]);
    render(<ParticipantsPage />);
    expect(await screen.findByText(/no participants yet/i)).toBeInTheDocument();
  });

  it('shows a load error as an alert', async () => {
    api.listParticipants.mockRejectedValue(new Error('Could not reach the server.'));
    render(<ParticipantsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i);
  });
});

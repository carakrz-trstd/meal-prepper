// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ImportPage } from './ImportPage';
import type { ImportJobStatus, MealDraft } from '../shared/types';

vi.mock('./api', () => ({
  api: { startImport: vi.fn(), getImport: vi.fn(), createMeal: vi.fn() },
}));
import { api } from './api';
const mocked = vi.mocked(api, true);

const draft: MealDraft = {
  name: 'Stub Pasta', baseServings: 2, baseServingsNeedsConfirmation: false,
  ingredients: [{ name: 'Spaghetti', quantity: 200, unit: 'g' }],
  prepMinutes: 10, cookMinutes: 20, caloriesPerServing: null, totalCostEur: null,
  caloriesEstimate: null, costEstimate: null, sourceUrl: 'https://example.org/r', missing: ['calories', 'cost'],
};

const renderPage = () => render(<MemoryRouter><ImportPage pollMs={5} /></MemoryRouter>);

beforeEach(() => vi.resetAllMocks());

describe('ImportPage (T-15)', () => {
  it('submitting a URL starts the import and shows the current stage (NFR-3)', async () => {
    mocked.startImport.mockResolvedValue({ kind: 'started', jobId: 'j1' });
    mocked.getImport.mockResolvedValue({ status: 'running', stage: 'estimating_calories' });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Recipe URL'), 'https://example.org/r');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(mocked.startImport).toHaveBeenCalledWith('https://example.org/r');
    expect(await screen.findByRole('status')).toHaveTextContent(/calories/i);
  });

  it('done opens the review form with the draft and saves nothing yet (AC-4)', async () => {
    mocked.startImport.mockResolvedValue({ kind: 'started', jobId: 'j1' });
    mocked.getImport.mockResolvedValue({ status: 'done', draft, skippedEstimates: [] } satisfies ImportJobStatus);
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Recipe URL'), 'https://example.org/r');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByLabelText('Name')).toHaveValue('Stub Pasta');
    expect(mocked.createMeal).not.toHaveBeenCalled();
    expect(screen.getAllByText(/^missing$/i).length).toBeGreaterThan(0); // AC-5
  });

  it('failed shows a clear message, keeps the URL field and links to manual entry (AC-6)', async () => {
    mocked.startImport.mockResolvedValue({ kind: 'started', jobId: 'j1' });
    mocked.getImport.mockResolvedValue({
      status: 'failed',
      error: { code: 'NO_RECIPE_FOUND', message: 'No recipe was found on this page.' },
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Recipe URL'), 'https://example.org/x');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no recipe was found/i);
    expect(screen.getByLabelText('Recipe URL')).toHaveValue('https://example.org/x');
    expect(screen.getByRole('link', { name: 'Add meal manually' })).toBeInTheDocument();
    expect(mocked.createMeal).not.toHaveBeenCalled();
  });

  it('skippedEstimates shows a notice that estimates were skipped (AC-21, AC-18)', async () => {
    mocked.startImport.mockResolvedValue({ kind: 'started', jobId: 'j1' });
    mocked.getImport.mockResolvedValue({ status: 'done', draft, skippedEstimates: ['calories', 'cost'] });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Recipe URL'), 'https://example.org/r');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByText(/estimates were skipped/i)).toBeInTheDocument();
  });

  it('an empty or invalid URL is rejected client-side without calling the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid web address/i);
    await user.type(screen.getByLabelText('Recipe URL'), 'ftp://example.org/x');
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(mocked.startImport).not.toHaveBeenCalled();
  });
});

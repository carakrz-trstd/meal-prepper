// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuggestPanel, type PlanPick } from '../../../src/client/constraints/SuggestPanel';
import type { OnlineHandlers } from '../../../src/client/constraints/constraintsApi';
import { anna, ben, cleo, emptyPrefs, libMatch, onlineMatch, result } from './fixtures';

vi.mock('../../../src/client/constraints/constraintsApi', () => ({
  constraintsApi: { getPrefs: vi.fn(), suggest: vi.fn(), startOnline: vi.fn(), openOnlineEvents: vi.fn() },
}));
import { constraintsApi } from '../../../src/client/constraints/constraintsApi';
const api = vi.mocked(constraintsApi, true);

let handlers: OnlineHandlers;
const closeEvents = vi.fn();

function renderPanel(over: { participants?: typeof anna[]; lastServings?: number; onPlan?: ReturnType<typeof vi.fn<(pick: PlanPick) => void>> } = {}) {
  const onPlan = over.onPlan ?? vi.fn<(pick: PlanPick) => void>();
  render(<SuggestPanel weekStart="2026-10-12" participants={over.participants ?? [anna, ben, cleo]} lastServings={over.lastServings ?? 4} onPlan={onPlan} />);
  return { onPlan };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getPrefs.mockResolvedValue(emptyPrefs);
  api.startOnline.mockResolvedValue({ searchId: 's1' });
  api.openOnlineEvents.mockImplementation(((_id: string, h: OnlineHandlers) => { handlers = h; return closeEvents; }) as never);
});

const submit = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Show suggestion' }));

describe('SuggestPanel (T-9, AC-1, AC-5, AC-9, AC-14, AC-15, AC-22, AC-26)', () => {
  it('is pre-filled from the last request (AC-26)', async () => {
    api.getPrefs.mockResolvedValue({ calorieLimit: 500, budgetLimit: 8, timeLimit: 45, participantIds: [1] });
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Calorie limit')).toHaveValue(500));
    expect(screen.getByLabelText('Budget limit (EUR)')).toHaveValue(8);
    expect(screen.getByLabelText('Cooking time limit (min)')).toHaveValue(45);
    expect(screen.getByLabelText('Anna')).toBeChecked();
    expect(screen.getByLabelText('Ben')).not.toBeChecked();
    expect(screen.getByLabelText('Servings')).toHaveValue(1); // one participant ticked
  });

  it('late-arriving saved preferences never overwrite what the user has already typed (AC-26)', async () => {
    let resolvePrefs!: (p: typeof emptyPrefs) => void;
    api.getPrefs.mockReturnValue(new Promise((resolve) => { resolvePrefs = resolve; }));
    const user = userEvent.setup();
    renderPanel();
    await user.type(await screen.findByLabelText('Calorie limit'), '700');
    resolvePrefs({ calorieLimit: 500, budgetLimit: 8, timeLimit: 45, participantIds: [1] });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByLabelText('Calorie limit')).toHaveValue(700);
    expect(screen.getByLabelText('Budget limit (EUR)')).toHaveValue(null);
    expect(screen.getByLabelText('Anna')).not.toBeChecked();
  });

  it('"Clear" empties the limits and unticks everybody (AC-26)', async () => {
    api.getPrefs.mockResolvedValue({ calorieLimit: 500, budgetLimit: 8, timeLimit: 45, participantIds: [1, 2] });
    const user = userEvent.setup();
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText('Calorie limit')).toHaveValue(500));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Calorie limit')).toHaveValue(null);
    expect(screen.getByLabelText('Budget limit (EUR)')).toHaveValue(null);
    expect(screen.getByLabelText('Cooking time limit (min)')).toHaveValue(null);
    expect(screen.getByLabelText('Anna')).not.toBeChecked();
    expect(screen.getByLabelText('Ben')).not.toBeChecked();
  });

  it('without ticked participants the servings default to the last servings; ticking sets them to the number ticked and they stay editable (AC-15)', async () => {
    const user = userEvent.setup();
    renderPanel({ lastServings: 6 });
    expect(await screen.findByLabelText('Servings')).toHaveValue(6);
    await user.click(screen.getByLabelText('Anna'));
    await user.click(screen.getByLabelText('Ben'));
    await user.click(screen.getByLabelText('Cleo'));
    expect(screen.getByLabelText('Servings')).toHaveValue(3);
    const servings = screen.getByLabelText('Servings');
    await user.clear(servings);
    await user.type(servings, '5');
    expect(servings).toHaveValue(5);
  });

  it('requests the suggestion with the entered values and shows one meal at a time (AC-1, AC-14)', async () => {
    api.suggest.mockResolvedValue(result([libMatch(1, 'Lentil soup', { favourite: true }), libMatch(2, 'Veggie pasta')]));
    const user = userEvent.setup();
    renderPanel();
    await screen.findByLabelText('Calorie limit');
    await user.type(screen.getByLabelText('Calorie limit'), '500');
    await user.type(screen.getByLabelText('Cooking time limit (min)'), '45');
    await user.click(screen.getByLabelText('Anna'));
    await submit(user);
    expect(api.suggest).toHaveBeenCalledWith({
      weekStart: '2026-10-12', calorieLimit: 500, budgetLimit: null, timeLimit: 45, participantIds: [1], servings: 1,
    });
    expect(await screen.findByRole('heading', { name: 'Lentil soup' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Veggie pasta' })).not.toBeInTheDocument();
  });

  it('shows the calories, scaled cost and total time of the shown meal (AC-1..3)', async () => {
    api.suggest.mockResolvedValue(result([libMatch(1, 'Lentil soup')]));
    const user = userEvent.setup();
    renderPanel({ lastServings: 2 });
    await screen.findByLabelText('Servings');
    await submit(user);
    const card = await screen.findByTestId('suggestion-card');
    expect(card).toHaveTextContent('450 kcal per serving');
    expect(card).toHaveTextContent('4 EUR'); // 8 EUR at 4 servings, planned for 2
    expect(card).toHaveTextContent('30 min');
  });

  it('"Another suggestion" advances and ends in a "no more library matches" state offering online search (AC-14, AC-24)', async () => {
    api.suggest.mockResolvedValue(result([libMatch(1, 'A'), libMatch(2, 'B')]));
    const user = userEvent.setup();
    renderPanel();
    await screen.findByLabelText('Servings');
    await submit(user);
    expect(await screen.findByRole('heading', { name: 'A' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Another suggestion' }));
    expect(screen.getByRole('heading', { name: 'B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Another suggestion' })).toBeDisabled();
    expect(screen.getByText(/no more library matches/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search online' })).toBeEnabled();
  });

  it('flags meals with unknown ingredients and used estimates (AC-9, AC-22)', async () => {
    api.suggest.mockResolvedValue(
      result([libMatch(1, 'Odd stew', { unknownIngredients: ['Dragon fruit', 'Jackfruit'], usedEstimate: { calories: true, cost: false } })]),
    );
    const user = userEvent.setup();
    renderPanel();
    await screen.findByLabelText('Servings');
    await submit(user);
    const card = await screen.findByTestId('suggestion-card');
    expect(card).toHaveTextContent(/could not verify against the restrictions/i);
    expect(card).toHaveTextContent('Dragon fruit, Jackfruit');
    expect(card).toHaveTextContent(/calories.*estimate/i);
  });

  it('no match: shows the message naming the limits and still offers the online search (AC-5)', async () => {
    api.suggest.mockResolvedValue(result([], { appliedLimits: ['calories: at most 100 kcal per serving'], message: 'No meal matches the limits (calories: at most 100 kcal per serving).' }));
    const user = userEvent.setup();
    renderPanel();
    await screen.findByLabelText('Servings');
    await submit(user);
    expect(await screen.findByText(/No meal matches the limits/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search online' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Plan this meal' })).not.toBeInTheDocument();
  });

  it('"Plan this meal" hands the shown library meal with servings and ticked participants to the planner (AC-15)', async () => {
    api.suggest.mockResolvedValue(result([libMatch(7, 'Lentil soup')]));
    const user = userEvent.setup();
    const { onPlan } = renderPanel();
    await screen.findByLabelText('Servings');
    await user.click(screen.getByLabelText('Anna'));
    await user.click(screen.getByLabelText('Ben'));
    await submit(user);
    await user.click(await screen.findByRole('button', { name: 'Plan this meal' }));
    expect(onPlan).toHaveBeenCalledWith({ source: 'library', mealId: 7, name: 'Lentil soup', servings: 2, participantIds: [1, 2] });
  });

  it('refuses invalid limits and servings without calling the API', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByLabelText('Calorie limit');
    await user.type(screen.getByLabelText('Calorie limit'), '-5');
    await submit(user);
    expect(api.suggest).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/limit/i);
    await user.clear(screen.getByLabelText('Calorie limit'));
    const servings = screen.getByLabelText('Servings');
    await user.clear(servings);
    await user.type(servings, '21');
    await submit(user);
    expect(api.suggest).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/servings/i);
  });

  it('shows an API error as an alert', async () => {
    api.suggest.mockRejectedValue(new Error('Could not reach the server.'));
    const user = userEvent.setup();
    renderPanel();
    await screen.findByLabelText('Servings');
    await submit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i);
  });
});

describe('SuggestPanel online search (T-12, AC-16, AC-19, AC-24)', () => {
  async function withLibrary(user: ReturnType<typeof userEvent.setup>, matches = [libMatch(1, 'A')]) {
    api.suggest.mockResolvedValue(result(matches));
    await screen.findByLabelText('Servings');
    await submit(user);
    await screen.findByRole('button', { name: 'Search online' });
  }

  it('no online request is made until "Search online" is clicked (AC-16)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await withLibrary(user);
    expect(api.startOnline).not.toHaveBeenCalled();
    expect(api.openOnlineEvents).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Search online' }));
    expect(api.startOnline).toHaveBeenCalledWith(expect.objectContaining({ weekStart: '2026-10-12', servings: 4 }));
    await waitFor(() => expect(api.openOnlineEvents).toHaveBeenCalledWith('s1', expect.any(Object)));
  });

  it('shows progress while searching, and candidates follow the library matches in the order found (AC-24)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await withLibrary(user);
    await user.click(screen.getByRole('button', { name: 'Search online' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/searching online/i);
    handlers.onCandidate(onlineMatch('c1', 'Web soup'));
    handlers.onCandidate(onlineMatch('c2', 'Web stew'));
    expect(screen.getByRole('heading', { name: 'A' })).toBeInTheDocument(); // still the library match
    await user.click(screen.getByRole('button', { name: 'Another suggestion' }));
    expect(screen.getByRole('heading', { name: 'Web soup' })).toBeInTheDocument();
    expect(screen.getByTestId('suggestion-card')).toHaveTextContent(/from the web/i);
    await user.click(screen.getByRole('button', { name: 'Another suggestion' }));
    expect(screen.getByRole('heading', { name: 'Web stew' })).toBeInTheDocument();
    handlers.onDone(2);
    await waitFor(() => expect(screen.queryByText(/searching online/i)).not.toBeInTheDocument());
    expect(closeEvents).toHaveBeenCalled();
  });

  it('with no library match, an arriving online candidate is shown directly', async () => {
    const user = userEvent.setup();
    renderPanel();
    await withLibrary(user, []);
    await user.click(screen.getByRole('button', { name: 'Search online' }));
    await waitFor(() => expect(api.openOnlineEvents).toHaveBeenCalled());
    handlers.onCandidate(onlineMatch('c1', 'Web soup'));
    expect(await screen.findByRole('heading', { name: 'Web soup' })).toBeInTheDocument();
  });

  it('a failed search shows the message while the library matches stay usable (AC-19)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await withLibrary(user, [libMatch(1, 'A'), libMatch(2, 'B')]);
    await user.click(screen.getByRole('button', { name: 'Search online' }));
    await waitFor(() => expect(api.openOnlineEvents).toHaveBeenCalled());
    handlers.onFailed('The online search failed or found nothing.');
    expect(await screen.findByText(/online search failed or found nothing/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Another suggestion' }));
    expect(screen.getByRole('heading', { name: 'B' })).toBeInTheDocument();
  });

  it('a search that finds nothing shows the same message (AC-19)', async () => {
    const user = userEvent.setup();
    renderPanel();
    await withLibrary(user);
    await user.click(screen.getByRole('button', { name: 'Search online' }));
    await waitFor(() => expect(api.openOnlineEvents).toHaveBeenCalled());
    handlers.onDone(0);
    expect(await screen.findByText(/online search failed or found nothing/i)).toBeInTheDocument();
  });

  it('a failure to start the search is shown and does not disturb the library matches', async () => {
    api.startOnline.mockRejectedValue(new Error('Could not reach the server.'));
    const user = userEvent.setup();
    renderPanel();
    await withLibrary(user);
    await user.click(screen.getByRole('button', { name: 'Search online' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i);
    expect(screen.getByRole('heading', { name: 'A' })).toBeInTheDocument();
  });

  it('"Plan this meal" for an online candidate hands over the search and candidate ids (AC-18)', async () => {
    const user = userEvent.setup();
    const { onPlan } = renderPanel();
    await withLibrary(user, []);
    await user.click(screen.getByRole('button', { name: 'Search online' }));
    await waitFor(() => expect(api.openOnlineEvents).toHaveBeenCalled());
    handlers.onCandidate(onlineMatch('c1', 'Web soup'));
    await user.click(await screen.findByRole('button', { name: 'Plan this meal' }));
    expect(onPlan).toHaveBeenCalledWith({ source: 'online', searchId: 's1', candidateId: 'c1', name: 'Web soup', servings: 4, participantIds: [] });
  });

  it('closes the event stream when the panel is closed', async () => {
    const user = userEvent.setup();
    const view = render(<SuggestPanel weekStart="2026-10-12" participants={[]} lastServings={4} onPlan={vi.fn()} />);
    api.suggest.mockResolvedValue(result([libMatch(1, 'A')]));
    await screen.findByLabelText('Servings');
    await submit(user);
    await screen.findByTestId('suggestion-card');
    await user.click(screen.getByRole('button', { name: 'Search online' }));
    await waitFor(() => expect(api.openOnlineEvents).toHaveBeenCalled());
    view.unmount();
    expect(closeEvents).toHaveBeenCalled();
  });
});


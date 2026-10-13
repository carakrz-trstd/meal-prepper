// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MealForm } from './MealForm';
import type { MealDraft } from '../shared/types';

const ok = () => vi.fn().mockResolvedValue({ kind: 'ok' });

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'Soup');
  await user.type(screen.getByLabelText('Ingredient name'), 'Carrot');
  await user.type(screen.getByLabelText('Quantity'), '200');
  await user.type(screen.getByLabelText('Cooking time (min)'), '30');
}

const draft = (over: Partial<MealDraft> = {}): MealDraft => ({
  name: 'Stub Pasta',
  baseServings: 2,
  baseServingsNeedsConfirmation: false,
  ingredients: [
    { name: 'Spaghetti', quantity: 200, unit: 'g' },
    { name: 'Salz nach Geschmack', quantity: null, unit: null },
  ],
  prepMinutes: 10,
  cookMinutes: 20,
  caloriesPerServing: null,
  totalCostEur: null,
  caloriesEstimate: null,
  costEstimate: null,
  sourceUrl: 'https://example.org/r',
  missing: ['calories', 'cost'],
  ...over,
});

describe('MealForm (T-13)', () => {
  it('pre-fills base servings with 4 (AC-14)', () => {
    render(<MealForm mode="create" onSave={ok()} />);
    expect(screen.getByLabelText('Base servings')).toHaveValue(4);
  });

  it('offers exactly the seven units in the unit select (AC-12)', () => {
    render(<MealForm mode="create" onSave={ok()} />);
    const options = within(screen.getByLabelText('Unit')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece']);
  });

  it('shows an error per missing field and does not call the API when submitting empty (AC-11)', async () => {
    const onSave = ok();
    const user = userEvent.setup();
    render(<MealForm mode="create" onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(onSave).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts.join(' ')).toMatch(/name is required/i);
    expect(alerts.join(' ')).toMatch(/ingredient/i);
    expect(alerts.join(' ')).toMatch(/cooking time/i);
  });

  it('adds and removes ingredient rows', async () => {
    const user = userEvent.setup();
    render(<MealForm mode="create" onSave={ok()} />);
    expect(screen.getAllByLabelText('Ingredient name')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(screen.getAllByLabelText('Ingredient name')).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: /Remove ingredient/ })[0]);
    expect(screen.getAllByLabelText('Ingredient name')).toHaveLength(1);
  });

  it('allows an empty prep time and shows the total time as prep + cook (AC-16)', async () => {
    const user = userEvent.setup();
    const onSave = ok();
    render(<MealForm mode="create" onSave={onSave} />);
    await fillValid(user);
    expect(screen.getByText(/total time: 30 min/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Preparation time (min)'), '15');
    expect(screen.getByText(/total time: 45 min/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Soup', baseServings: 4, cookMinutes: 30, prepMinutes: 15 });
  });

  it('a 409 shows a warning and a "Save anyway" button that resubmits with the flag (AC-20)', async () => {
    const onSave = vi.fn().mockResolvedValueOnce({ kind: 'duplicate' }).mockResolvedValueOnce({ kind: 'ok' });
    const user = userEvent.setup();
    render(<MealForm mode="create" onSave={onSave} />);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(await screen.findByText(/meal with this name already exists/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save anyway' }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][1]).toEqual({ allowDuplicateName: true });
  });

  it('review mode marks missing values and keeps a null-quantity ingredient visible (AC-5)', () => {
    render(<MealForm mode="review" draft={draft()} onSave={ok()} />);
    expect(screen.getAllByText(/^missing$/i).length).toBeGreaterThanOrEqual(2); // calories and cost
    expect(screen.getAllByLabelText('Ingredient name')[1]).toHaveValue('Salz nach Geschmack');
    expect(screen.getAllByLabelText('Quantity')[1]).toHaveValue(null);
  });

  it('shows an estimate proposal with an "Estimate" label; accepting sends the flag (AC-10, AC-19)', async () => {
    const onSave = ok();
    const user = userEvent.setup();
    render(
      <MealForm
        mode="review"
        draft={draft({ caloriesEstimate: { value: 350, isEstimate: true }, costEstimate: { value: 4.2, isEstimate: true } })}
        onSave={onSave}
      />,
    );
    expect(screen.getAllByText(/estimate:/i)).toHaveLength(2);
    // the estimate is not a saved value until accepted
    expect(screen.getByLabelText('Calories per serving')).toHaveValue(null);
    await user.click(screen.getByRole('button', { name: 'Accept calories estimate' }));
    expect(screen.getByLabelText('Calories per serving')).toHaveValue(350);
    // complete the unparsed ingredient line (quantity and unit) so the form is valid
    await user.type(screen.getAllByLabelText('Quantity')[1], '1');
    await user.selectOptions(screen.getAllByLabelText('Unit')[1], 'tsp');
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    const sent = onSave.mock.calls[0][0];
    expect(sent.caloriesPerServing).toBe(350);
    expect(sent.caloriesEstimated).toBe(true);
    expect(sent.totalCostEur ?? null).toBeNull(); // cost estimate was not accepted -> not saved
    expect(sent.costEstimated).toBeFalsy();
  });

  it('typing a different value after accepting sends the plain value (AC-19)', async () => {
    const onSave = ok();
    const user = userEvent.setup();
    render(<MealForm mode="review" draft={draft({ caloriesEstimate: { value: 350, isEstimate: true } })} onSave={onSave} />);
    await user.click(screen.getByRole('button', { name: 'Accept calories estimate' }));
    await user.clear(screen.getByLabelText('Calories per serving'));
    await user.type(screen.getByLabelText('Calories per serving'), '400');
    await user.type(screen.getAllByLabelText('Quantity')[1], '1');
    await user.selectOptions(screen.getAllByLabelText('Unit')[1], 'tsp');
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ caloriesPerServing: 400, caloriesEstimated: false });
  });

  it('typing a value over an estimate proposal removes the proposal; the typed value is saved as a plain value (AC-10, AC-19)', async () => {
    const onSave = ok();
    const user = userEvent.setup();
    render(
      <MealForm
        mode="review"
        draft={draft({ costEstimate: { value: 4.2, isEstimate: true }, ingredients: [{ name: 'Spaghetti', quantity: 200, unit: 'g' }] })}
        onSave={onSave}
      />,
    );
    expect(screen.getByText(/estimate: 4.20 eur/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Total cost (EUR)'), '7.5');
    expect(screen.queryByText(/estimate:/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ totalCostEur: 7.5 });
    expect(onSave.mock.calls[0][0].costEstimated).toBeFalsy();
  });

  it('marks servings "please confirm" until confirmed (AC-23)', async () => {
    const user = userEvent.setup();
    render(<MealForm mode="review" draft={draft({ baseServings: 4, baseServingsNeedsConfirmation: true })} onSave={ok()} />);
    expect(screen.getByText(/please confirm/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm servings' }));
    expect(screen.queryByText(/please confirm/i)).not.toBeInTheDocument();
  });

  it('edit mode starts from the stored values and keeps an estimated marker only while unchanged (AC-19)', async () => {
    const onSave = ok();
    const user = userEvent.setup();
    render(
      <MealForm
        mode="edit"
        meal={{
          id: 1, name: 'Stew', baseServings: 4, ingredients: [{ id: 1, position: 0, name: 'Beef', nameKey: 'beef', quantity: 500, unit: 'g' }],
          prepMinutes: 0, cookMinutes: 60, totalMinutes: 60, caloriesPerServing: 300, caloriesEstimated: true,
          totalCostEur: 8, costEstimated: false, isFavourite: false, sourceUrl: null, createdAt: '', updatedAt: '',
        }}
        onSave={onSave}
      />,
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Stew');
    expect(screen.getByText(/estimated/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save meal' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ caloriesPerServing: 300, caloriesEstimated: true });
    await user.clear(screen.getByLabelText('Calories per serving'));
    await user.type(screen.getByLabelText('Calories per serving'), '310');
    expect(screen.queryByText(/estimated/i)).not.toBeInTheDocument();
  });
});

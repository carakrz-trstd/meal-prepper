# Roadmap: Weekly Meal Planner & Shopping List

Source: [briefing.md](briefing.md). This roadmap describes requirements only; no technology or architecture decisions are made here.

## Epic 1 — Meal Library & Recipe Import

Foundation: a collection of meals with the data every other epic relies on.

**Functional requirements**
- Add a meal with name, ingredients (with quantities for a defined base number of servings), calories per meal, total cost per meal, and cooking time.
- Show calories per meal, total cost per meal and cooking time on every meal.
- Mark and unmark a meal as a favourite; view/filter favourites.
- Import a recipe from an online source: parse it into a meal (name, ingredients, and calories/cost/time where available) and let the user review and complete missing values before saving.
- Report a clear error when a recipe cannot be parsed.

**Non-functional requirements**
- Meals persist between sessions.
- Quantities and units are stored in a form that allows scaling to a different number of servings.

## Epic 2 — Weekly Planning & Shopping List

Depends on: Epic 1 (meals to plan).

**Functional requirements**
- Plan exactly one meal per day for the current week (a single meal, not separate lunch and dinner).
- A meal cannot be planned twice within the same week; the same meal may be planned in different weeks.
- Ask for the number of servings (how many people are eating) for each planned meal.
- Generate the weekly shopping list from all planned meals, with ingredient quantities scaled to each meal's servings.
- Combine identical ingredients across meals into one entry with a summed quantity.
- Update the shopping list when the plan changes (meal added, replaced, removed, or servings changed).

**Non-functional requirements**
- The shopping list is readable and usable while shopping (clear grouping, easy to scan).

## Epic 3 — Constraints, Suggestions & Dietary Safety

Depends on: Epic 1 (meal data: calories, cost, time, ingredients). Can be built in parallel with Epic 2; the only touchpoint is that planned meals in Epic 2 are checked against participants' restrictions once both are available.

**Functional requirements**
- Generate a meal suggestion within a calorie limit.
- Generate a meal suggestion within a budget limit (total cost per meal).
- Generate a meal suggestion within a cooking-time limit.
- Limits can be combined; if no meal matches, say so clearly.
- Maintain an ingredient blacklist; meals containing a blacklisted ingredient never appear in suggestions.
- Enter dietary restrictions per participant.
- Check each meal against the restrictions of all participants eating it, and flag or exclude meals that violate any of them — both in suggestions and when planning a meal in Epic 2.

**Non-functional requirements**
- Suggestions respond fast enough to feel instant for a personal-sized meal collection.
- Dietary checks err on the side of caution: a meal with unknown ingredient information is flagged rather than silently accepted.

## Dependencies and parallelisation

```
Epic 1 ──► Epic 2
   └─────► Epic 3
```

- Epic 1 comes first.
- Epics 2 and 3 are independent of each other after Epic 1 and can be implemented in parallel.
- Final integration: dietary-restriction checks (Epic 3) apply to meals planned in Epic 2.

## Coverage of the briefing

| Briefing item | Epic |
|---|---|
| One meal per day, no repeats within the week, servings | 2 |
| Add meals, favourites | 1 |
| Shopping list scaled to servings | 2 |
| Recipe import | 1 |
| Show calories / cost / cooking time | 1 |
| Suggest within calorie / budget / time limit | 3 |
| Ingredient blacklist | 3 |
| Dietary restrictions per participant | 3 |

# Spec: Epic 2 — Weekly Planning & Shopping List

Confidence: 94%

PRD: [2_weekly-planning-shopping-list.md](2_weekly-planning-shopping-list.md)

## Overview

This spec turns the Epic 2 PRD into a buildable design: planning one meal per day for calendar weeks (Monday to Sunday), preventing repeats within a week, per-meal servings, and a shopping list that is derived from the plan, scaled, merged across meals, tickable, printable and copyable as text.

Dependencies:
- **Epic 1** (spec: [1_meal-library-recipe-import-spec.md](1_meal-library-recipe-import-spec.md); table and column names below are aligned with it). This spec relies on the Epic 1 data model: a `meals` row with name, base servings, calories per serving (nullable), total cost in EUR for the base servings (nullable), preparation minutes (0 if empty), cooking minutes, favourite flag; and `ingredients` rows (`meal_id`, `position`, `name`, `name_key`, `quantity` REAL, `unit` from the fixed list g, kg, ml, l, tsp, tbsp, piece). Columns used below: `meals.base_servings`, `calories_per_serving`, `total_cost_eur`, `prep_minutes`, `cook_minutes`, `is_favourite`, `name`; `ingredients.name_key`, `quantity`, `unit`. Epic 1 shared code is reused: `UNITS` and `Unit` from `src/shared/units.ts`, `normalizeIngredientName` from `src/shared/normalize.ts`, `scaleQuantity` from `src/shared/scaling.ts`, the migration runner (`001_init.sql` is Epic 1's, this epic adds `002_weekly_plan.sql`), and the env variable `MEALPLANNER_DB`. The Epic 1 PRD requires a TypeScript/Node.js backend, a browser UI and an embedded SQLite file; the project structure and tooling decisions below are the same as in the Epic 1 spec.
- **Epic 1 touchpoints:** the meal-delete confirmation dialog (AC-18) must mention the plan, and the `meals` table must be deletable with a foreign-key cascade (Epic 1 `MealLibraryPage`/`ConfirmDialog`, `DELETE /api/meals/:id`). Epic 2 delivers the lookup endpoint and the dialog change (T-14).
- **Epic 3** (not a dependency): later adds a dietary check to the planning step. The planning service has a single `assertPlannable` seam (T-5) where that check can be added; nothing is built for it here.

Out of scope: meal CRUD, import, favourites toggling (Epic 1); suggestions, blacklist, dietary checks (Epic 3).

## Key Architecture Decisions

| # | Decision | Choice | Rationale | Source |
|---|----------|--------|-----------|--------|
| AD-1 | Application type and language | Local web app, TypeScript on Node.js backend, browser UI | Fixed by the Epic 1 PRD | Epic 1 PRD NFR-4 |
| AD-2 | Storage | Embedded SQLite file, plan stored with the meals | Fixed | PRD NFR-2, Epic 1 PRD NFR-5 |
| AD-3 | Backend framework and project structure | Fastify + TypeScript, feature folders (`meals/`, `plan/`, `shopping/`) under `src/server`, shared code in `src/shared`, JSON REST API | Built-in JSON-schema validation fits the servings 1..20 rule (AC-20); one structure serves all three epics | Cycle 1 (architecture advisor); consistent with Epic 1 spec AD-12, AD-15 |
| AD-4 | Frontend | React + Vite SPA served by the backend in a single process | Meal picker, replace confirmation and instant tick/plan updates (AC-8, AC-25) fit client state replaced from API responses | Cycle 1 (architecture advisor); Epic 1 spec AD-13 |
| AD-5 | SQLite access and migrations | `better-sqlite3` with hand-written SQL in repository modules; numbered `.sql` migration files applied by a tiny runner tracked in `PRAGMA user_version` | Synchronous, no build step, in-memory DBs for tests; plan constraints written directly in SQL | Cycle 1 (architecture advisor); Epic 1 spec AD-14 |
| AD-6 | Test tooling | Vitest for unit and API integration tests against in-memory SQLite (Fastify `inject`), React Testing Library for components, Playwright for e2e | One fast runner for shared TypeScript domain code and the API | Cycle 1 (architecture advisor); Epic 1 spec AD-11 |
| AD-7 | Shopping list storage model | Derived on every read by the pure module `shared/aggregate.ts` from the plan and the meals; only ticks are stored | Meal edits and deletes (AC-17, AC-18) show up with no sync code; pure function is easy to test | Cycle 1 (architecture advisor) |
| AD-8 | Tick persistence for AC-19 | Table `shopping_tick` with a base-unit snapshot; ticked iff snapshot >= current need; snapshot lowered to the current need on read; stale rows deleted | "Kept if unchanged or lower, cleared if higher" with no reconciliation on mutations; 5 → 3 → 4 clears the tick | Cycle 1 (architecture advisor) |
| AD-9 | Plan data model | One table `planned_meal(week_start, day_of_week, meal_id, servings)` with `UNIQUE(week_start, day_of_week)`, `UNIQUE(week_start, meal_id)`, `ON DELETE CASCADE` on `meal_id` | Uniqueness rules (AC-2, AC-3) become database constraints; cascade covers AC-18 | Cycle 1 (architecture advisor) |
| AD-10 | UI update after a plan change | Each mutation endpoint returns the updated week plan and shopping list; the client replaces its state with it | One round trip, no second fetch, no extra infrastructure; meets NFR-3 | Cycle 1 (architecture advisor) |
| AD-11 | Unit families and factors | Four families: mass (g, kg), volume (ml, l), spoon (tsp, tbsp), piece. Factors 1 kg = 1000 g, 1 l = 1000 ml, 1 tbsp = 3 tsp. No cross-family conversion | The PRD names pairs g/kg, ml/l, tsp/tbsp as families and forbids mixing; spoons are not converted to ml | PRD AC-14, NFR-4 |
| AD-12 | Ingredient identity | Trimmed, case-insensitive name plus unit family | | PRD AC-7, AC-14, Epic 1 PRD FR-18 |
| AD-13 | Weeks | ISO date string of the Monday (`YYYY-MM-DD`), day of week 1 (Mon) to 7 (Sun); current date comes from an injectable clock | Testability of "current week" and past days | PRD FR-9, AC-11 |
| AD-14 | Copy as text and print | Client-side only: `navigator.clipboard` and a print stylesheet; no server rendering, accounts or integrations | | PRD NFR-5, AC-22 |
| AD-15 | Meal delete lookup | Epic 2 plan module exposes `GET /api/plan/usage/:mealId`; deletion itself stays the Epic 1 endpoint and the foreign key cascade removes plan rows | One delete path, no duplicate logic | PRD AC-18, FR-12 |

The tasks and design below follow these decisions: Fastify, React + Vite SPA, better-sqlite3 with numbered SQL migrations, Vitest + Playwright, a single package with `src/server`, `src/client`, `src/shared`.

## Technical Design

### Data model

New migration `002_weekly_plan.sql` (Epic 1 owns `001_init.sql`). Every connection runs `PRAGMA foreign_keys = ON`.

```sql
CREATE TABLE planned_meal (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start   TEXT    NOT NULL,                       -- ISO date of the Monday, YYYY-MM-DD
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  meal_id      INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  servings     INTEGER NOT NULL CHECK (servings BETWEEN 1 AND 20),
  UNIQUE (week_start, day_of_week),                    -- one meal per day (AC-2)
  UNIQUE (week_start, meal_id)                         -- no repeat within a week (AC-3)
);

CREATE TABLE shopping_tick (
  week_start   TEXT NOT NULL,
  ingredient_key TEXT NOT NULL,                        -- trimmed, lower-cased name
  unit_family  TEXT NOT NULL CHECK (unit_family IN ('mass','volume','spoon','piece')),
  ticked_qty   REAL NOT NULL,                          -- snapshot in the family's base unit (g, ml, tsp, piece)
  PRIMARY KEY (week_start, ingredient_key, unit_family)
);

CREATE TABLE app_setting (
  key TEXT PRIMARY KEY, value TEXT NOT NULL
);                                                     -- 'last_servings' (default absent = 4)
```

No shopping list table exists: the list is computed (AD-7). `last_servings` is written on every successful plan or servings change (AC-15).

Shared types (`src/shared/plan-types.ts`):

```ts
type UnitFamily = 'mass' | 'volume' | 'spoon' | 'piece';
type Unit = 'g' | 'kg' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'piece';
interface PlannedDay { day: number; date: string; entry: null | {
  plannedMealId: number; mealId: number; mealName: string; servings: number;
  caloriesPerServing: number | null;   // null shown as "missing"
  totalCostEur: number | null;         // cost * servings / base_servings, null if meal cost missing
  totalMinutes: number;                // prep + cook
}}
interface ShoppingEntry { id: string; name: string; family: UnitFamily; quantity: number; unit: Unit;
  sources: { day: number; mealName: string }[]; ticked: boolean }
interface WeekView { weekStart: string; days: PlannedDay[]; shopping: ShoppingEntry[]; lastServings: number }
```

`ShoppingEntry.id` is `${family}:${key}`.

### Modules and components

Server (`src/server/plan/`, feature folder):
- `plan.repository.ts`: SQL for `planned_meal`, `shopping_tick`, `app_setting` and the join with `meals` / `ingredients`. Synchronous better-sqlite3 prepared statements.
- `plan.service.ts`: plan rules (one meal per day, no repeat, servings range, week validity, replace), and the `assertPlannable(weekStart, day, mealId)` seam.
- `ticks.service.ts`: tick, untick, reconcile (AC-16, AC-19).
- `week-view.ts`: assembles `WeekView` for a week: days, derived shopping list, reconciled ticks.
- `plan.routes.ts`: Fastify routes, JSON schema validation.
- `clock.ts`: `Clock { today(): string }`, default system clock, overridable by env `APP_FIXED_DATE` (used by e2e).

Shared pure code (`src/shared/`), used by server and client:
- `week.ts`: `mondayOf(date)`, `addWeeks(weekStart, n)`, `dayDate(weekStart, day)`, `isValidWeekStart`, `compareWeeks`.
- `unit-conversion.ts` (new; Epic 1's `units.ts` keeps `UNITS` and `Unit`): `familyOf(unit)`, `toBase(qty, unit)`, `formatBase(qty, family) -> {quantity, unit}` (threshold and rounding rules), `formatQuantity`.
- `aggregate.ts`: `buildShoppingList(plannedMeals, ingredients) -> ShoppingEntry-like[]` (scale, merge, sort).
- `shopping-text.ts`: `formatShoppingText(entries) -> string`.

Client (`src/client/plan/`): `WeekPlanPage` (week navigation, seven `DayCard`s), `MealPicker` (dialog with search, favourites filter, "already planned" marker), `ServingsDialog` (or inline step in the picker), `ReplaceConfirm`, `ShoppingListPage` (`ShoppingEntryRow`, `EmptyState`, copy and print buttons), `usePlan` hook (holds the current `WeekView`, replaced by each mutation response), `planApi.ts`.

### Interfaces (API)

All paths JSON. `weekStart` must be a Monday; a week before the current week returns `400 WEEK_IN_PAST`, a non-Monday `400 INVALID_WEEK`. All mutations return the full `WeekView`.

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `GET /api/plan/:weekStart` | | `200 WeekView` | 400 INVALID_WEEK, WEEK_IN_PAST |
| `PUT /api/plan/:weekStart/days/:day` | `{ mealId, servings, replace? }` | `200 WeekView` | 400 INVALID_SERVINGS (not an integer 1..20), 404 MEAL_NOT_FOUND, 409 DAY_OCCUPIED (day has a meal and `replace` is not true), 409 MEAL_ALREADY_PLANNED (`{ day }` of the other day) |
| `PATCH /api/plan/:weekStart/days/:day` | `{ servings }` | `200 WeekView` | 400 INVALID_SERVINGS, 404 DAY_EMPTY |
| `DELETE /api/plan/:weekStart/days/:day` | | `200 WeekView` | 404 DAY_EMPTY |
| `PUT /api/plan/:weekStart/ticks` | `{ entryId, ticked }` | `200 WeekView` | 404 ENTRY_NOT_FOUND |
| `GET /api/plan/usage/:mealId` | | `200 { plannedCount }` (number of planned_meal rows across all weeks) | 404 |

Servings is required in `PUT` (AC-5): a missing value is `400 INVALID_SERVINGS`. `GET /api/plan/:weekStart` defaults nothing; the client pre-fills the dialog from `WeekView.lastServings` (initially 4).

Replacing the meal of a day with the meal already on that day only changes servings. Replacing with a meal planned on a different day of the same week is `MEAL_ALREADY_PLANNED`.

### Shopping list rules (`aggregate.ts`)

1. For each planned meal (ordered by day) and each ingredient: `scaled = quantity * servings / base_servings`.
2. Group by `(trim(name).toLowerCase(), familyOf(unit))`. Sum `toBase(scaled, unit)` in the family base unit (g, ml, tsp, piece).
3. Piece family: `need = ceil(sum)` (rounded up after summing, AC-21). A small epsilon (1e-9) is subtracted before `ceil` so floating-point noise does not add a piece.
4. Display unit: mass `>= 1000 g` becomes kg; volume `>= 1000 ml` becomes l; spoon `>= 3 tsp` becomes tbsp; otherwise the base unit. Display quantity is rounded to at most one decimal (round half up) and shown without a trailing `.0`.
5. Display name is the trimmed name of the first occurrence (earliest day) of the group.
6. Sort alphabetically by key with `Intl.Collator('de', { sensitivity: 'base' })`, ties by family order mass, volume, spoon, piece. One flat list (AC-16).
7. `sources` lists `{ day, mealName }` for each contributing planned meal, ordered by day (AC-24); shown as e.g. "Mon Pasta, Wed Soup".
8. A week without planned meals gives an empty list (AC-12, AC-26).

### Tick reconciliation (`ticks.service.ts`)

`needBase` is the unrounded-to-display base quantity of an entry (piece: after ceil). On every `WeekView` assembly, inside one transaction:
- For each `shopping_tick` row of the week: if no entry with that `(key, family)` exists, delete the row (no longer needed); else if `ticked_qty > needBase`, set `ticked_qty = needBase` (lowering the snapshot, so 5 → 3 → 4 clears the tick).
- `entry.ticked = ticked_qty >= needBase - 1e-9`.
- Ticking sets `ticked_qty = needBase`; unticking deletes the row.

This gives: unchanged or lower need stays ticked, higher need becomes unticked showing the new total, removed entries disappear (AC-19).

### Key flows

**Journey 1: plan a meal.** Open `/plan` → `GET /api/plan/:currentMonday` → seven day cards, empty days labelled "Nothing planned". Click "Plan meal for Wednesday" → MealPicker lists all meals (search by name, favourites toggle, meals already planned that week carry a "Planned this week" marker, AC-25) → choose meal → servings step pre-filled with `lastServings` (4 initially; AC-15), accepts only integers 1..20, inline error otherwise (AC-20), cannot proceed without a value (AC-5) → `PUT .../days/3` → server validates, writes, sets `last_servings`, returns `WeekView` → card shows name, servings, kcal per serving, total cost, total minutes; missing values shown as "missing" (AC-1, AC-23).

**Journey 2: repeat refused.** Picking a meal planned on another day: picker marks it, and a click (or a PUT) yields `409 MEAL_ALREADY_PLANNED`; UI shows "'<meal>' is already planned on <weekday> this week." and keeps the picker open. In a different week (navigate with "Next week") the same meal is accepted (AC-3, AC-4).

**Journey 3: change the plan.** On an occupied day: "Replace meal" opens the picker; after choosing a meal and servings, a confirm step "Replace '<old>' with '<new>'?" precedes `PUT ... replace: true` (AC-2); a 409 `DAY_OCCUPIED` without confirm does not change anything. "Change servings" calls `PATCH`; "Remove" calls `DELETE`. Each response replaces the client state, so the plan and shopping list update without a manual refresh (AC-8). All days of the current week, including past days, accept all actions (AC-13).

**Week navigation (AC-11).** "Previous week" is disabled on the current week; "Next week" is always available; `?week=` query validated against the same rules, past values redirect to the current week.

**Journey 4: shopping list.** `/shopping?week=...` uses the same `WeekView.shopping`. Entries show tick box, name, quantity and unit, a secondary line with sources. Ticking calls `PUT .../ticks` and replaces state. Empty week: empty state "No meals are planned for this week" with link "Go to the plan" (AC-26). "Copy as text" writes `formatShoppingText` (one line per entry: `<quantity> <unit> <name>`, e.g. `1.5 kg Flour`, `3 piece Onion`) to the clipboard and confirms with a status message; "Print" calls `window.print()` and the print stylesheet hides navigation and buttons and shows tick boxes as empty squares (AC-22).

**Journey 5: planned meal edited or deleted.** Edit: nothing to do, plan and list read the meal live (AC-17). Delete: the Epic 1 delete dialog calls `GET /api/plan/usage/:mealId`; if `plannedCount > 0` the text adds "This meal is planned in N place(s). Deleting it removes it from the plan." Confirm calls the Epic 1 delete endpoint; the cascade removes `planned_meal` rows; tick rows are reconciled on next read. Cancel changes nothing (AC-18).

## Implementation Tasks

Test files are under `tests/` for Vitest (unit and API integration against an in-memory SQLite database) and `e2e/` for Playwright.

### T-1: Migration and database setup
- **Satisfies:** AC-9, AC-18 (cascade); NFR-2
- **Depends on:** Epic 1 database and migration runner
- **Tests first (TDD):**
  - `tests/plan/migration.test.ts`: applies all migrations on an empty DB and creates `planned_meal`, `shopping_tick`, `app_setting`; inserting a second row with same `(week_start, day_of_week)` fails; same `(week_start, meal_id)` fails; `servings` 0 and 21 fail; deleting a meal cascades its `planned_meal` rows; data written to a file DB is present after closing and reopening it.
- **Implementation:** add the migration file, ensure `foreign_keys = ON` on connection open.
- **Done when:** migration tests pass.

### T-2: Week date utilities
- **Satisfies:** AC-11; FR-9
- **Depends on:** none
- **Tests first (TDD):**
  - `tests/shared/week.test.ts`: `mondayOf` of a Wednesday, of a Sunday (previous Monday), of a Monday; across month and year boundaries; `addWeeks`; `dayDate(weekStart, 7)` is the Sunday; `isValidWeekStart` rejects non-Mondays and malformed strings; `compareWeeks`.
- **Implementation:** `src/shared/week.ts` using UTC date arithmetic on `YYYY-MM-DD` strings (no time-zone drift).
- **Done when:** tests pass.

### T-3: Units, conversion, rounding
- **Satisfies:** AC-14, AC-21; FR-6 (units), FR-15; NFR-4
- **Depends on:** none
- **Tests first (TDD):**
  - `tests/shared/unit-conversion.test.ts`: `familyOf` for all seven units; `toBase(2,'kg')=2000`; `toBase(1,'tbsp')=3`; `formatBase(999,'mass')` is 999 g; `formatBase(1000,'mass')` is 1 kg; 1500 g is 1.5 kg; 1000 ml is 1 l; 2 tsp stays tsp; 3 tsp is 1 tbsp; 4 tsp is 1.3 tbsp; 333.33 g shows 333.3; 0.04 shows 0; trailing `.0` dropped; piece 2.1 shows 3 piece; piece 2.0000000001 shows 2.
- **Implementation:** `src/shared/unit-conversion.ts` per AD-11 and the rules above (imports `Unit` from Epic 1's `src/shared/units.ts`).
- **Done when:** tests pass.

### T-4: Shopping list aggregation
- **Satisfies:** AC-6, AC-7, AC-12, AC-14, AC-17 (derived), AC-21, AC-24; FR-5, FR-6, FR-10, FR-15, FR-18
- **Depends on:** T-3
- **Tests first (TDD):**
  - `tests/shared/aggregate.test.ts`: scales 200 g at 2 base servings planned for 6 → 600 g (AC-6); same ingredient in two meals ("Flour" and " flour ") → one entry summed (AC-7); 600 g + 0.5 kg → 1.1 kg; 500 ml + 1 l → 1.5 l; 2 tsp + 1 tbsp → 5 tsp shown as 1.7 tbsp; "Milk" in ml and "Milk" in piece stay two entries (AC-14); pieces 1 × 1.5 scaled plus 1 → ceil of sum (AC-21); entries sorted alphabetically case-insensitively with "Äpfel" handled by the German collator; `sources` ordered by day with meal names (AC-24); no planned meals → empty list (AC-12); meal with changed ingredients yields the new result (AC-17, pure-function level).
- **Implementation:** `src/shared/aggregate.ts` per the rules; groups by the stored `ingredients.name_key` (equal to `normalizeIngredientName`), scales with Epic 1's `scaleQuantity`; also returns `needBase` per entry for ticks.
- **Done when:** tests pass.

### T-5: Plan repository and service
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-9, AC-13, AC-15, AC-20; FR-1 to FR-4, FR-8, FR-14
- **Depends on:** T-1, T-2
- **Tests first (TDD):**
  - `tests/plan/plan.service.test.ts` (in-memory DB, fixed clock 2026-10-14): plan a meal on Wednesday stores it with servings (AC-1); planning on an occupied day without `replace` throws DAY_OCCUPIED; with `replace` the day holds exactly the new meal (AC-2); same meal on another day in same week throws MEAL_ALREADY_PLANNED with the other day (AC-3); same meal in next week succeeds (AC-4); servings 0, 21, 2.5, "3", missing → INVALID_SERVINGS, 1 and 20 accepted (AC-20); weeks before the current Monday → WEEK_IN_PAST, non-Monday → INVALID_WEEK; a past day (Monday of the current week) can be added, replaced, changed, removed (AC-13); replacing a day with its own meal only changes servings; `last_servings` is 4 when nothing was planned and equals the latest saved servings afterwards (AC-15); plan persists after reopening a file DB (AC-9); `assertPlannable` is called before every insert.
- **Implementation:** repository and service; each mutation in a transaction; `assertPlannable` initially checks only meal existence and the repeat rule.
- **Done when:** tests pass.

### T-6: Tick service and reconciliation
- **Satisfies:** AC-16, AC-19; FR-8, FR-13
- **Depends on:** T-1, T-4
- **Tests first (TDD):**
  - `tests/plan/ticks.test.ts`: tick stores `needBase`; untick deletes; entry is ticked iff snapshot >= need; need unchanged keeps tick; need drops 500 → 300 keeps tick and lowers snapshot to 300; then need rises to 400 → unticked with new total (AC-19); need rises directly → unticked; entry disappears → tick row deleted, and entry reappearing later is unticked; same ingredient in different families ticks independently; ticks survive reopening a file DB (AC-16); ticks of other weeks untouched.
- **Implementation:** `ticks.service.ts`, reconciliation per the design section.
- **Done when:** tests pass.

### T-7: Week view and API routes
- **Satisfies:** AC-1, AC-2, AC-3, AC-5, AC-8, AC-11, AC-12, AC-13, AC-15, AC-20, AC-23; FR-7, FR-9, FR-17; NFR-3
- **Depends on:** T-4, T-5, T-6
- **Tests first (TDD):**
  - `tests/plan/plan.routes.test.ts` (Fastify `inject`, in-memory DB): `GET` returns seven days with dates Monday to Sunday and `lastServings` 4; `PUT` happy path returns the week view including shopping entries (AC-8); every mutation response contains the updated shopping list; `PUT` without servings → 400 INVALID_SERVINGS (AC-5); 409 bodies carry codes and the other day (AC-3); `PATCH` and `DELETE` work and the list changes accordingly; a `DAY_EMPTY` 404; past week → 400; calories per serving null serialises as null, total cost = cost × servings / base servings, e.g. 8 EUR at base 4 for 6 servings is 12, null cost → null (AC-23); total minutes = prep + cook; partial week returns valid view with only planned days in the list (AC-12); responses for a one-week plan in under 200 ms in the test (NFR-3).
- **Implementation:** `week-view.ts`, `plan.routes.ts` with JSON schemas, error mapping to codes, clock plumbing.
- **Done when:** tests pass.

### T-8: Plan-usage endpoint and delete cascade
- **Satisfies:** AC-18; FR-12
- **Depends on:** T-1, T-7
- **Tests first (TDD):**
  - `tests/plan/usage.test.ts`: `GET /api/plan/usage/:mealId` returns 0 for an unplanned meal, N for a meal planned in N weeks, 404 for unknown meal; after deleting the meal through the Epic 1 delete endpoint its plan rows are gone, its days are empty in the week view and its ingredients no longer appear in the list; deleting never touches other meals' plan rows.
- **Implementation:** route and repository query.
- **Done when:** tests pass.

### T-9: Client API and state hook
- **Satisfies:** AC-8; FR-7; NFR-3
- **Depends on:** T-7
- **Tests first (TDD):**
  - `tests/client/usePlan.test.tsx`: after each mutation the hook state equals the response `WeekView` (no extra fetch); an error response sets an error with its code and leaves state unchanged; week change loads the new week; past week in the URL falls back to the current week.
- **Implementation:** `planApi.ts` (typed fetch), `usePlan.ts`.
- **Done when:** tests pass.

### T-10: Weekly plan page
- **Satisfies:** AC-1, AC-2, AC-11, AC-12, AC-13, AC-23; FR-9, FR-10, FR-17
- **Depends on:** T-9
- **Tests first (TDD):**
  - `tests/client/WeekPlanPage.test.tsx`: renders seven day cards labelled Monday to Sunday with dates; empty days show "Nothing planned"; a planned day shows name, "N servings", "<n> kcal per serving", "<cost> EUR" and "<m> min"; missing calories or cost render "missing", never 0 (AC-23); "Previous week" disabled on the current week, "Next week" loads the next Monday (AC-11); occupied days offer Replace, Change servings and Remove; past days of the current week offer the same actions (AC-13).
- **Implementation:** `WeekPlanPage`, `DayCard`, navigation.
- **Done when:** tests pass.

### T-11: Meal picker, servings step, replace confirmation
- **Satisfies:** AC-1, AC-2, AC-3, AC-5, AC-15, AC-20, AC-25; FR-1 to FR-4, FR-14, FR-19
- **Depends on:** T-9, T-10
- **Tests first (TDD):**
  - `tests/client/MealPicker.test.tsx`: typing in "Search meals" filters by name case-insensitively; "Favourites only" checkbox shows only favourites; meals planned in the viewed week show "Planned this week" (AC-25); picking an already-planned meal shows the "already planned on <weekday>" message and does not call the API (AC-3); servings field pre-filled with `lastServings`, initially 4 (AC-15); values 0, 21, 2.5, empty show an error and the confirm button does nothing (AC-5, AC-20); replacing shows the confirm step and only then calls `PUT` with `replace: true`; cancelling leaves the day unchanged (AC-2).
- **Implementation:** `MealPicker` (uses the Epic 1 meal list endpoint), `ServingsDialog`, `ReplaceConfirm`, accessible roles and labels as listed in the e2e section.
- **Done when:** tests pass.

### T-12: Shopping list page
- **Satisfies:** AC-8, AC-10, AC-16, AC-24, AC-26; FR-11, FR-18, FR-20; NFR-1
- **Depends on:** T-9
- **Tests first (TDD):**
  - `tests/client/ShoppingListPage.test.tsx`: entries rendered as one list in the given order, each with a checkbox labelled with the name, quantity and unit shown, and a secondary line with sources (AC-10, AC-24); ticking calls the tick endpoint and the row shows checked from the response; a response where the tick was cleared shows unchecked (AC-19 at UI level); empty week shows "No meals are planned for this week" and a link "Go to the plan" to `/plan?week=...` (AC-26); the list updates when the shared `WeekView` state changes (AC-8).
- **Implementation:** `ShoppingListPage`, `ShoppingEntryRow`, `EmptyState`; large tap targets, ticked entries struck through and moved nowhere (order stays alphabetical).
- **Done when:** tests pass.

### T-13: Copy as text and print
- **Satisfies:** AC-22; FR-16; NFR-5
- **Depends on:** T-4, T-12
- **Tests first (TDD):**
  - `tests/shared/shopping-text.test.ts`: two entries give `1.5 kg Flour\n3 piece Onion`; empty list gives an empty string.
  - `tests/client/ShoppingActions.test.tsx`: "Copy as text" calls `navigator.clipboard.writeText` with the formatted text and shows "Copied"; clipboard rejection shows "Copy failed" without crashing; "Print" calls `window.print`.
  - A CSS test is not written; the print stylesheet is checked in the e2e test via `page.emulateMedia({ media: 'print' })`.
- **Implementation:** `shopping-text.ts`, `ShoppingActions`, `print.css` (`@media print`: hide navigation and buttons, black on white, checkbox squares, avoid page breaks inside rows).
- **Done when:** tests pass.

### T-14: Epic 1 delete dialog integration
- **Satisfies:** AC-18; FR-12
- **Depends on:** T-8 and the Epic 1 delete dialog
- **Tests first (TDD):**
  - `tests/client/DeleteMealDialog.test.tsx`: for a meal with `plannedCount = 2` the dialog text mentions that the meal is planned and will be removed from the plan; for `plannedCount = 0` the original text is shown; confirm deletes; cancel deletes nothing and sends no delete request.
- **Implementation:** extend the Epic 1 dialog with the usage lookup; on failure of the lookup show the generic confirmation text and a note that plan usage could not be checked.
- **Done when:** tests pass.

### T-15: E2E test
- **Satisfies:** all ACs at journey level (see E2E section)
- **Depends on:** T-10, T-11, T-12, T-13, T-14
- **Tests first (TDD):** the e2e file is the test; the implement-epic skill creates it.
- **Implementation:** see E2E Test section.
- **Done when:** the e2e suite passes headless.

## Traceability

| AC | Tasks | Tests |
|----|-------|-------|
| AC-1 | T-5, T-7, T-10, T-11 | plan.service (plan stores servings), plan.routes (PUT happy path), E2E J1 |
| AC-2 | T-5, T-7, T-11 | plan.service (replace), MealPicker (replace confirm), E2E J3 |
| AC-3 | T-5, T-7, T-11 | plan.service (MEAL_ALREADY_PLANNED), plan.routes (409), MealPicker, E2E J2 |
| AC-4 | T-5 | plan.service (same meal next week), E2E J2 |
| AC-5 | T-7, T-11 | plan.routes (missing servings), MealPicker (empty servings) |
| AC-6 | T-4 | aggregate (scaling) , E2E J4 |
| AC-7 | T-4 | aggregate (merge with trim/case) , E2E J4 |
| AC-8 | T-7, T-9, T-12 | plan.routes (mutation returns list), usePlan, ShoppingListPage, E2E J3 |
| AC-9 | T-1, T-5 | migration (reopen), plan.service (reopen), E2E persistence |
| AC-10 | T-12 | ShoppingListPage (entry layout), E2E J4 |
| AC-11 | T-2, T-5, T-7, T-10 | week.test, plan.service (WEEK_IN_PAST), WeekPlanPage (navigation), E2E J1 |
| AC-12 | T-4, T-7, T-10 | aggregate (empty), plan.routes (partial week), WeekPlanPage (empty days), E2E J1 |
| AC-13 | T-5, T-7, T-10 | plan.service (past day), WeekPlanPage (actions on past days), E2E J3 |
| AC-14 | T-3, T-4 | units (families), aggregate (different families separate, tsp/tbsp merge) |
| AC-15 | T-5, T-11 | plan.service (last_servings), MealPicker (pre-fill), E2E J1 |
| AC-16 | T-6, T-12 | ticks (persist), ShoppingListPage (checkbox, order), E2E J4 |
| AC-17 | T-4, T-7, T-8 | aggregate (new values), E2E J5 |
| AC-18 | T-1, T-8, T-14 | migration (cascade), usage.test, DeleteMealDialog, E2E J5 |
| AC-19 | T-6, T-12 | ticks (unchanged, lower, higher, removed), E2E J4 |
| AC-20 | T-5, T-7, T-11 | plan.service (1..20), MealPicker (invalid values), E2E J2b |
| AC-21 | T-3, T-4 | units (rounding, thresholds, piece ceil), aggregate (piece sum) |
| AC-22 | T-13 | shopping-text, ShoppingActions, E2E J4 |
| AC-23 | T-7, T-10 | plan.routes (cost scaling, null), WeekPlanPage (missing), E2E J1 |
| AC-24 | T-4, T-12 | aggregate (sources), ShoppingListPage, E2E J4 |
| AC-25 | T-11 | MealPicker (search, favourites, marker), E2E J1 |
| AC-26 | T-12 | ShoppingListPage (empty state), E2E J4b |

| FR / NFR | Tasks |
|----------|-------|
| FR-1 | T-5, T-11 |
| FR-2 | T-5, T-11 |
| FR-3 | T-5, T-11 |
| FR-4 | T-5, T-7, T-11 |
| FR-5 | T-4 |
| FR-6 | T-3, T-4 |
| FR-7 | T-7, T-8, T-9 |
| FR-8 | T-1, T-5, T-6 |
| FR-9 | T-2, T-10 |
| FR-10 | T-4, T-10 |
| FR-11 | T-12 |
| FR-12 | T-8, T-14 |
| FR-13 | T-6 |
| FR-14 | T-5, T-11 |
| FR-15 | T-3, T-4 |
| FR-16 | T-13 |
| FR-17 | T-7, T-10 |
| FR-18 | T-4, T-12 |
| FR-19 | T-11 |
| FR-20 | T-12 |
| NFR-1 | T-12 (large tap targets, scannable rows; verified in E2E J4) |
| NFR-2 | T-1 |
| NFR-3 | T-7 (timing assertion), T-9 |
| NFR-4 | T-3 |
| NFR-5 | T-13 |

## E2E Test (Playwright)

The implement-epic skill builds and sets up this test later; this section only describes it. One file: `e2e/weekly-planning.spec.ts`, depending on the Epic 1 e2e setup (Playwright config, web server start).

**Start and fixtures.** Playwright `webServer` starts the app (production build, single process serving API and SPA) (the Epic 1 `npm run start:e2e` script, port 4173) with `MEALPLANNER_DB` set to a fresh temp SQLite file per run and `APP_FIXED_DATE=2026-10-14` (a Wednesday, so the current week starts Monday 2026-10-12). Browser side uses `page.clock.install({ time: new Date('2026-10-14T09:00:00') })`. A `beforeAll` seeds meals via the Epic 1 API `POST /api/meals` (no scraping, so nothing external needs stubbing; no network access is used or required):
- "Pasta Bolognese": base 4, ingredients Spaghetti 400 g, Onion 2 piece, Olive oil 2 tbsp; calories 600; cost 8 EUR; prep 10; cook 25.
- "Onion Soup": base 2, Onion 3 piece, Olive oil 1 tbsp, Spaghetti 0.2 kg; calories missing; cost missing; prep empty; cook 30. (The mixed units g/kg and tbsp test merging.)
- "Pancakes": base 4, Flour 500 g, Milk 500 ml; favourite; calories 400; cost 4 EUR; cook 20.
- "Milk Rice": base 2, Milk 1 piece, Rice 200 g; cook 40 (Milk in piece stays separate from Milk in ml).
A `beforeEach` resets the plan by deleting planned days through the API.

**Tests (one per journey, plus failure and persistence):**

1. *J1 plan a meal (AC-1, 11, 12, 15, 23, 25).* Go to `/plan`. Assert heading "Week of 12 Oct 2026", seven day cards by `getByRole('group', { name: 'Monday' })` to Sunday, "Previous week" disabled, all days contain "Nothing planned". Click `getByRole('button', { name: 'Plan meal for Wednesday' })`; in the dialog `getByRole('dialog', { name: 'Choose a meal' })` fill `getByLabel('Search meals')` with "past", expect only Pasta Bolognese; clear it, tick `getByLabel('Favourites only')`, expect only Pancakes; untick; choose Pasta Bolognese. The servings step `getByLabel('Servings')` has value 4. Fill 6, click "Add to plan". Assert the Wednesday card shows "Pasta Bolognese", "6 servings", "600 kcal per serving", "12 EUR" (8 x 6 / 4), "35 min". Add Onion Soup on Friday with servings kept at the pre-filled 6 (AC-15); assert "calories: missing" and "cost: missing" text, not 0. Reopen the picker for Monday and assert Pasta Bolognese and Onion Soup carry the text "Planned this week" (AC-25). Other days remain "Nothing planned" (AC-12).
2. *J2 repeat refused (AC-3, AC-4).* With Pasta Bolognese planned on Wednesday, open the picker for Thursday, choose Pasta Bolognese: expect `getByRole('alert')` with "already planned on Wednesday this week" and Thursday still empty. Click "Next week", open the picker for Monday, choose Pasta Bolognese, servings 2, add: succeeds. Go back to this week (Previous week) and assert Wednesday unchanged.
2b. *Servings validation (AC-5, AC-20).* In the servings step enter 0, 21, 2.5 and empty: each time the alert "Servings must be a whole number from 1 to 20" shows and the day stays empty; 20 is accepted.
3. *J3 change the plan (AC-2, 8, 13).* Plan Pasta Bolognese on Monday (a past day of the current week, AC-13) with 4 servings and open `/shopping`: Spaghetti 400 g. Go to `/plan`, click "Change servings" on Monday, set 8: shopping shows Spaghetti 800 g. Click "Replace meal" on Monday, choose Pancakes, servings 4; assert the confirm text "Replace 'Pasta Bolognese' with 'Pancakes'?" and click "Replace"; the card shows Pancakes only; the shopping list shows Flour 500 g, Milk 500 ml and no Spaghetti. Click "Remove" on Monday: the day is empty and the shopping list shows the empty state.
4. *J4 shopping list (AC-6, 7, 10, 14, 16, 19, 21, 22, 24).* Plan Pasta Bolognese Monday with 4 servings (Spaghetti 400 g, Onion 2, Olive oil 2 tbsp) and Onion Soup Tuesday with 4 servings (base 2, so Onion 6, Olive oil 2 tbsp, Spaghetti 0.4 kg), Milk Rice Wednesday with 2 servings (Milk 1 piece, Rice 200 g), Pancakes Thursday with 4 servings (Flour 500 g, Milk 500 ml). Open `/shopping`; the list role `getByRole('list', { name: 'Shopping list' })` has items in the order: Flour, Milk 500 ml, Milk 1 piece (ties in family order mass, volume, spoon, piece), Olive oil, Onion, Rice, Spaghetti. Assert Spaghetti "800 g" (400 g + 0.4 kg shown as 800 g), Onion "8 piece", Olive oil "4 tbsp" (6 tsp + 6 tsp = 12 tsp), Rice "200 g". Each item shows a secondary line, e.g. Spaghetti "Mon Pasta Bolognese, Tue Onion Soup". Tick Spaghetti: the checkbox is checked. Reload the page (new `browser.newContext()` to prove server-side persistence, AC-16): still checked. On `/plan` change Pasta Bolognese to 2 servings: Spaghetti need drops to 600 g, and it stays checked; change Pasta Bolognese to 8 servings: need 1200 g shown "1.2 kg" and the box is unchecked (AC-19). Remove Onion Soup: Onion falls to 4 piece. Click "Copy as text" after `context.grantPermissions(['clipboard-read','clipboard-write'])` and assert `navigator.clipboard.readText()` contains the lines `800 g Spaghetti` and `4 piece Onion` (AC-22). Use `page.emulateMedia({ media: 'print' })` and assert the navigation and "Copy as text" button are not visible while the list is (AC-22). Assert list item font size is at least 16px and rows have at least 44px height (NFR-1).
4b. *Empty week (AC-26).* Open `/shopping?week=2026-10-19` with nothing planned: text "No meals are planned for this week" and `getByRole('link', { name: 'Go to the plan' })` navigates to `/plan?week=2026-10-19`.
5. *J5 edit and delete a planned meal (AC-17, 18).* Plan Pancakes on Monday for 4. Via the Epic 1 UI edit Pancakes: change Flour to 750 g, save; `/shopping` shows Flour 750 g. In the meal library click "Delete" on Pancakes: the confirmation dialog contains "planned" and "removed from the plan"; click "Cancel": meal and plan remain. Delete again and click "Delete meal": the meal is gone from the library; `/plan` shows Monday "Nothing planned"; `/shopping` shows the empty state.
6. *Persistence (AC-9).* Plan a meal, then stop and restart the web server process (Playwright fixture that restarts it with the same `MEALPLANNER_DB`), reload `/plan`, and assert the meal and servings are still there; shopping tick state also remains.
7. *Past weeks (AC-11).* Visit `/plan?week=2026-10-05`: the app shows the current week (redirect) and no past navigation exists.

Each test lists the ACs it verifies in its title. Nothing external is stubbed; the e2e suite never calls scraping code because meals are seeded through the Epic 1 API.

## Decision Log

### Cycle 1
- Q: Which backend framework and project structure is used? → A: Fastify + TypeScript, feature folders under `src/server`, shared code in `src/shared`, JSON REST API
- Q: Which frontend approach is used? → A: React + Vite SPA served by the backend in a single process
- Q: How is SQLite accessed and how is the schema versioned? → A: `better-sqlite3` with hand-written SQL in repository modules, numbered `.sql` migrations tracked in `PRAGMA user_version`
- Q: Which test tooling is used? → A: Vitest, React Testing Library, Playwright
- Q: How is the shopping list stored? → A: Derived on every read by the pure module `shared/aggregate.ts`; only ticks are stored
- Q: How is tick state persisted so that AC-19 holds? → A: `shopping_tick` base-unit snapshot, lowered to the current need on read, stale rows deleted
- Q: How is the plan modelled in the database? → A: One table `planned_meal` with the two UNIQUE constraints and `ON DELETE CASCADE`
- Q: How does the UI stay in sync after a plan change? → A: Each mutation returns the updated week plan and shopping list and the client replaces its state
- Alignment with the Epic 1 spec (no question): table and column names set to `meals`/`ingredients`, `002_weekly_plan.sql`, `MEALPLANNER_DB`, reuse of Epic 1 shared code; unit families moved to `unit-conversion.ts` so `units.ts` stays Epic 1's

## Open Questions

None — confidence reached 90%.

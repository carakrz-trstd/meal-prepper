# Spec: Epic 1 — Meal Library & Recipe Import

Confidence: 93%

PRD: [1_meal-library-recipe-import.md](1_meal-library-recipe-import.md)

## Overview

This spec turns the Epic 1 PRD into an implementable design for a local web app: a Node.js/TypeScript backend with an embedded SQLite database and a browser UI. It covers the meal library (add, edit, delete, favourites, filter), the recipe import (schema.org first, HTML fallback, review step, error path), and scraped estimates for calories (public nutrition database website) and cost (rewe.de) within a 30-second import budget.

Dependencies: none (Epic 1 is the foundation). Epics 2 and 3 will consume the data model (`meals`, `ingredients`) described here, in particular the structured fields quantity, unit and normalised ingredient name (NFR-6).

Status of technical decisions: stack and storage are fixed by the PRD; test runner, backend framework, UI framework, DB access and migrations, project structure, nutrition source, import progress mechanism and quantity storage were decided in Cycle 1 (see AD-11 to AD-18). No `.claude/_architecture-guidelines.md` exists.

## Key Architecture Decisions

| # | Decision | Choice | Rationale | Source |
|---|----------|--------|-----------|--------|
| AD-1 | Application type | Local web app in the browser | Fixed by PRD | PRD NFR-4, Cycle 1 |
| AD-2 | Language / runtime | TypeScript end to end, Node.js backend | Fixed by PRD | PRD NFR-4, Cycle 2 |
| AD-3 | Persistence | Embedded SQLite database file | Fixed by PRD | PRD NFR-5, Cycle 1 |
| AD-4 | Recipe parsing | schema.org Recipe JSON-LD first, heuristic HTML parsing as fallback | Fixed by PRD | PRD FR-5, AC-9 |
| AD-5 | Estimates | Web scraping (no LLM); calories from a public nutrition database website per ingredient, cost from rewe.de; never saved without user confirmation | Fixed by PRD | PRD FR-9, FR-20, NFR-8 |
| AD-6 | Scraper replaceability | `NutritionProvider` and `PriceProvider` interfaces, injected into the import service | Fixed by PRD (NFR-9) | PRD NFR-9 |
| AD-7 | Import time limit | 30 s total deadline enforced server-side via an `AbortSignal` shared by all fetches | Fixed by PRD | PRD FR-17, AC-21 |
| AD-8 | Ingredient fields | quantity, unit and name stored as separate columns; unit from fixed list g, kg, ml, l, tsp, tbsp, piece | Fixed by PRD | PRD NFR-6, AC-12 |
| AD-9 | Units of values | Calories per single serving; total cost in EUR for the whole meal at base servings; times in whole minutes | Fixed by PRD | PRD AC-13, AC-16 |
| AD-10 | E2E test tool | Playwright (one test file for the epic, built later by implement-epic) | Fixed by write-spec skill | write-spec SKILL.md |
| AD-11 | Test runner | Vitest | Native TypeScript/ESM with no config, fast, Jest-compatible API | Cycle 1 (architecture advisor) |
| AD-12 | Backend framework | Fastify | TypeScript-friendly, built-in schema validation and plugins, fits a small Node-only JSON API | Cycle 1 (architecture advisor) |
| AD-13 | Browser UI | React + Vite SPA | Stateful UI (review/edit form, favourites filter, estimated markers, import progress); Epics 2 and 3 add more | Cycle 1 (architecture advisor) |
| AD-14 | SQLite access and migrations | better-sqlite3 with hand-written versioned SQL migration files; typed row mappers in `src/shared` | Small fixed schema, no ORM lock-in, data model costly to change; Kysely is the upgrade path | Cycle 1 (architecture advisor) |
| AD-15 | Project structure | Single npm package with `src/server`, `src/client`, `src/shared` | One package.json, shared types, no workspace overhead | Cycle 1 (architecture advisor) |
| AD-16 | Nutrition database website | Open Food Facts | Public, free, open API, no key, German coverage, per-100g data scales directly; unmatched generic ingredients leave calories missing (AC-24) | Cycle 1 (architecture advisor) |
| AD-17 | Import progress feedback | `POST /api/imports` starts a job; the UI polls `GET /api/imports/:jobId` | Real progress, server-side 30 s deadline, survives a page refresh, simpler than SSE | Cycle 1 (architecture advisor) |
| AD-18 | Quantity storage type | REAL decimal column plus a unit enum text column with CHECK constraint; round only for display | Simplest for scaling and summing | Cycle 1 (architecture advisor) |

## Technical Design

Names below follow the decided stack: a single package with `src/server`, `src/client`, `src/shared`; Fastify; React + Vite; better-sqlite3; Vitest.

### Data model

Table `meals`:

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| name | TEXT NOT NULL | trimmed, non-empty (AC-11) |
| base_servings | INTEGER NOT NULL CHECK (base_servings >= 1) | AC-14 |
| calories_per_serving | REAL NULL | NULL = missing, never 0 (AC-2, AC-13) |
| calories_estimated | INTEGER NOT NULL DEFAULT 0 CHECK (IN (0,1)) | AC-19 |
| total_cost_eur | REAL NULL | whole meal at base servings (AC-13) |
| cost_estimated | INTEGER NOT NULL DEFAULT 0 CHECK (IN (0,1)) | AC-19 |
| prep_minutes | INTEGER NOT NULL DEFAULT 0 CHECK (>= 0) | AC-16 |
| cook_minutes | INTEGER NOT NULL CHECK (>= 1) | mandatory (AC-11) |
| is_favourite | INTEGER NOT NULL DEFAULT 0 CHECK (IN (0,1)) | AC-3 |
| source_url | TEXT NULL | imported meals only (AC-17) |
| created_at / updated_at | TEXT NOT NULL | ISO 8601 UTC |

Table `ingredients`:

| Column | Type | Notes |
|---|---|---|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | |
| meal_id | INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE | foreign keys enabled per connection |
| position | INTEGER NOT NULL | display order |
| name | TEXT NOT NULL | as entered (trimmed) |
| name_key | TEXT NOT NULL | `name.trim().toLowerCase()`; used for comparison, merging (Epic 2), filtering (Epic 3) (AC-22) |
| quantity | REAL NOT NULL CHECK (quantity > 0) | decimal in the stated unit; rounded only for display |
| unit | TEXT NOT NULL CHECK (unit IN ('g','kg','ml','l','tsp','tbsp','piece')) | AC-12 |

Indexes: `ingredients(meal_id)`, `ingredients(name_key)`, `meals(lower(name))` for the duplicate-name check. No instructions or image columns (AC-17). Total time is derived (`prep_minutes + cook_minutes`), not stored (AC-16). Scaling to other servings is `quantity * targetServings / base_servings`, a pure function in `src/shared/scaling.ts` (AC-8).

Estimated markers are stored per value (`calories_estimated`, `cost_estimated`). On update, a marker is cleared when the incoming value differs from the stored one or the field is edited (see T-4); it stays when the value is unchanged.

The import job is held in memory only (`Map<jobId, ImportJob>`), not in SQLite; unfinished jobs are lost on restart, which is acceptable for a local app.

Schema is created by hand-written, numbered SQL migration files; a small runner tracked via `PRAGMA user_version` applies pending migrations at startup. Database file path from env `MEALPLANNER_DB` (default `./data/meals.db`; tests use a temp file or `:memory:`).

### Modules and components

Shared (`src/shared`):
- `units.ts` — `UNITS = ['g','kg','ml','l','tsp','tbsp','piece'] as const`, `Unit` type.
- `types.ts` — `Meal`, `MealInput`, `Ingredient`, `IngredientInput`, `MealDraft`, `ImportJobStatus`, `ApiError`.
- `validation.ts` — `validateMealInput(input): ValidationResult` (name, >=1 ingredient, cook time, servings integer >= 1, unit in list, quantity > 0, times integers >= 0, optional values >= 0). Used by server and client.
- `normalize.ts` — `normalizeIngredientName(s)` (trim + lowercase only, AC-22).
- `scaling.ts` — `scaleQuantity(q, baseServings, targetServings)`.

Server (`src/server`):
- `db/` — connection, migrations, `MealRepository` (`list({favouritesOnly})`, `get(id)`, `create`, `update`, `delete`, `setFavourite`, `existsByName(name, excludeId?)`).
- `services/MealService.ts` — validation, duplicate-name warning logic, estimate-marker rules.
- `import/RecipeFetcher.ts` — fetches a URL with timeout/abort, size cap (2 MB), only http/https, `User-Agent` set.
- `import/parsers/jsonLdParser.ts` — extracts the schema.org `Recipe` from `<script type="application/ld+json">` (also inside `@graph` and arrays).
- `import/parsers/htmlParser.ts` — fallback: heading as name, ingredient list elements (microdata `itemprop=recipeIngredient`, or lists near an "Zutaten"/"Ingredients" heading).
- `import/ingredientLineParser.ts` — "200 g Mehl" / "1 1/2 tbsp sugar" to `{quantity, unit, name}`; maps common unit spellings (EL, TL, Stück, Gramm, ...) to the fixed units; unparseable lines keep `quantity: null, unit: null` and are flagged in the draft for the user.
- `import/durationParser.ts` — ISO 8601 durations (`PT1H30M`) to minutes.
- `import/ImportService.ts` — orchestrates fetch, parse, estimates; owns the job registry and the 30 s deadline.
- `import/estimators/NutritionProvider.ts` (interface), `PriceProvider.ts` (interface); `estimators/OpenFoodFactsNutritionProvider.ts`, `estimators/ReweDePriceProvider.ts`; `estimators/estimate.ts` with `estimateCalories()` and `estimateCost()` (pure aggregation over providers, unit conversion).
- `http/` — Fastify routes and error mapping.

Client (`src/client`):
- `MealLibraryPage` (list, favourites filter toggle, favourite star button, delete with confirm dialog), `MealCard` / `MealRow` (shows calories per serving, cost, prep/cook/total time, "missing" labels, "estimated" badge, source link).
- `MealForm` (create/edit/review; ingredient rows with number input and unit `<select>`, base servings pre-filled 4, "please confirm" marker, duplicate-name warning with "Save anyway").
- `ImportPage` (URL input, progress/status display, error panel with "try another source" and "add manually").
- `api.ts` typed fetch client.

Unit conversion for estimates (`estimators/units.ts`): g/kg direct; ml/l treated as g with density 1 (approximation, labelled estimate); tsp = 5 ml, tbsp = 15 ml; piece uses a per-ingredient piece weight if the provider supplies one, otherwise the ingredient has no match (value stays missing, never guessed).

### Interfaces (API / adapters)

REST JSON under `/api`:

| Method / path | Request | Response |
|---|---|---|
| `GET /api/meals?favourites=true` | optional filter | `200 Meal[]` |
| `GET /api/meals/:id` | | `200 Meal` / `404` |
| `POST /api/meals` | `MealInput` (+ `allowDuplicateName?: boolean`) | `201 Meal`; `422 {code:'VALIDATION', fields:[{field,message}]}`; `409 {code:'DUPLICATE_NAME'}` when the name exists and `allowDuplicateName` is not true |
| `PUT /api/meals/:id` | `MealInput` (+ `allowDuplicateName?`) | `200 Meal`; `404`; `422`; `409` |
| `DELETE /api/meals/:id` | | `204`; `404` |
| `PUT /api/meals/:id/favourite` | `{ value: boolean }` | `200 Meal` |
| `POST /api/imports` | `{ url: string }` | `202 { jobId }`; `422` for a malformed URL |
| `GET /api/imports/:jobId` | | `200 ImportJobStatus` / `404` |

`MealInput`: `{ name, baseServings, ingredients: [{name, quantity, unit}], prepMinutes?, cookMinutes, caloriesPerServing?, totalCostEur?, caloriesEstimated?, costEstimated?, sourceUrl? }`. `caloriesEstimated`/`costEstimated` are accepted as true only for values the user confirmed from a draft.

`MealDraft`: `{ name, baseServings, baseServingsNeedsConfirmation: boolean, ingredients: [{name, quantity|null, unit|null}], prepMinutes|null, cookMinutes|null, caloriesPerServing|null, totalCostEur|null, caloriesEstimate: {value, isEstimate:true}|null, costEstimate: {value, isEstimate:true}|null, sourceUrl, missing: string[] }`. Source-provided calories/cost/time go into the plain fields; scraped values go into the `*Estimate` fields so the UI can show them as proposals.

`ImportJobStatus`: `{ status: 'running', stage: 'fetching'|'parsing'|'estimating_calories'|'estimating_cost' } | { status: 'done', draft: MealDraft, skippedEstimates: ('calories'|'cost')[] } | { status: 'failed', error: { code: 'UNREACHABLE'|'NO_RECIPE_FOUND'|'INVALID_URL', message } }`. The UI polls `GET /api/imports/:jobId` (about once per second) until the status is `done` or `failed`.

Adapter interfaces:
```ts
interface NutritionProvider {
  // kcal per 100 g (and optional grams per piece) or null if no match
  lookup(ingredientName: string, signal: AbortSignal): Promise<{ kcalPer100g: number; gramsPerPiece?: number } | null>;
}
interface PriceProvider {
  // price for the purchasable pack with its pack size, or null if no match
  lookup(ingredientName: string, signal: AbortSignal): Promise<{ priceEur: number; packAmount: number; packUnit: 'g'|'ml'|'piece' } | null>;
}
```
Cost per ingredient = price per base unit x needed quantity (proportional, not whole packs; approximation documented as estimate, NFR-8). Providers must throw nothing for "not found" (return null); network errors and aborts are caught by `estimate.ts` and treated as "no value" (AC-18).

### Key flows

**Journey 1 — add meal manually**
1. User opens "Add meal"; `MealForm` shows base servings 4, empty ingredient row, unit select with only the seven units, prep empty, cook empty.
2. Client validates (`validateMealInput`); missing name/ingredient/cook time block saving and mark the fields (AC-11).
3. `POST /api/meals`. Server validates again, checks `existsByName`; on a duplicate and no `allowDuplicateName` returns 409; the form shows a warning with "Save anyway", which resubmits with `allowDuplicateName: true` (AC-20).
4. Meal inserted in a transaction (meal + ingredients). Library shows it with calories ("missing" if NULL), cost, prep/cook/total minutes (AC-1, AC-2, AC-16).

**Journey 2 — favourites**
1. Star button calls `PUT /api/meals/:id/favourite {value}`; UI updates the star.
2. Toggle "Favourites only" calls `GET /api/meals?favourites=true`; unmarking removes the meal from that view (AC-3).

**Journey 3 — import**
1. User enters a URL on `ImportPage`; `POST /api/imports` returns a `jobId`; the UI shows progress by stage (NFR-3).
2. `ImportService.run(job)`: creates `AbortSignal.timeout(30000)`; `RecipeFetcher` loads the page; `jsonLdParser` tried first, then `htmlParser` (AC-9). No yield in the page leads to `baseServings = 4`, `baseServingsNeedsConfirmation = true` (AC-23). Source calories/cost/time are used when present (AC-4).
3. If calories are missing and ingredient names/quantities are all parsed: `estimateCalories` looks up each ingredient (sequential or limited concurrency 3), converts to grams, sums `kcalPer100g/100 * grams`, divides by base servings; any null leaves calories missing (AC-24). Likewise `estimateCost` with `PriceProvider` (AC-25). Provider errors or no match lead to the field staying missing (AC-18).
4. If the signal aborts at 30 s: remaining estimates are skipped, `skippedEstimates` lists them, the draft is returned anyway (AC-21).
5. UI shows `MealForm` in review mode: missing values clearly marked, estimates shown as proposals with an "estimate" label and "Accept"/overwrite; base servings marked "please confirm" when applicable (AC-5, AC-10, AC-23).
6. Save posts `MealInput` with `sourceUrl`; accepted estimates carry `caloriesEstimated`/`costEstimated = true`; the library shows an "estimated" badge (AC-17, AC-19). Nothing is saved before this step (AC-4).

**Journey 4 — import fails**
1. Fetch fails (DNS, timeout, non-2xx, non-HTML) or no recipe is found by either parser: job ends `failed` with `UNREACHABLE` or `NO_RECIPE_FOUND`.
2. UI shows an error panel with a plain-language message, a field for another URL, and a link "Add meal manually". No meal is created (AC-6).

**Journey 5 — edit / delete**
1. Meal detail opens `MealForm` in edit mode with stored values; save calls `PUT`. If the user changes the calorie or cost value, the matching `*_estimated` flag becomes 0; if unchanged it stays (AC-19). Changes shown and persisted (AC-15).
2. Delete opens a confirm dialog; confirm calls `DELETE` (meal, ingredients and favourite state vanish); cancel does nothing (AC-15).

**Persistence (AC-7, NFR-1)** SQLite in WAL-less default journal mode with synchronous writes; database file lives on disk; a restart test reopens the file and reads the meal and favourite flag.

## Implementation Tasks

Tests use Vitest. HTTP tests use Fastify's in-process `inject`; client component tests use Testing Library with React.

### T-1: Project scaffold, shared units/validation/scaling
- **Satisfies:** AC-8, AC-11, AC-12, AC-14, AC-16, AC-22, NFR-2, NFR-4, NFR-6, FR-18
- **Depends on:** none
- **Tests first (TDD):**
  - `src/shared/validation.test.ts`: rejects empty/whitespace name; rejects zero ingredients; rejects missing cook time; rejects cook time 0 or non-integer; accepts missing prep time (treated as 0); rejects base servings 0, 2.5, empty; rejects unit `cup`; accepts each of the seven units; rejects quantity 0 or negative; accepts empty calories and cost; rejects negative calories/cost.
  - `src/shared/normalize.test.ts`: `"  Milk "` and `"milk"` and `"MILK"` normalise equal; `"Eggs"` and `"Egg"` differ; `"olive oil"` and `"oil, olive"` differ.
  - `src/shared/scaling.test.ts`: 4 to 8 servings doubles 200 g to 400 g; 4 to 2 halves; 4 to 4 unchanged; 3 to 4 keeps decimals.
- **Implementation:** package.json, tsconfig, test runner config, scripts (`dev`, `build`, `test`, `test:e2e`, `start`); `src/shared/{units,types,validation,normalize,scaling}.ts`.
- **Done when:** shared tests pass; `npm test` runs.

### T-2: Database schema and migrations
- **Satisfies:** AC-7, AC-13, AC-17, NFR-1, NFR-5, NFR-6
- **Depends on:** T-1
- **Tests first (TDD):**
  - `src/server/db/migrations.test.ts`: fresh DB gets all tables and `schema_version`; running migrations twice is a no-op; inserting an ingredient with unit `cup` fails the CHECK; inserting a meal with `cook_minutes` NULL fails; deleting a meal cascades to its ingredients; the `meals` table has no instructions or image column.
- **Implementation:** migration files `001_init.sql` (tables and indexes above), migration runner, `openDatabase(path)` with `PRAGMA foreign_keys = ON`.
- **Done when:** migration tests pass on `:memory:` and on a temp file.

### T-3: MealRepository
- **Satisfies:** AC-1, AC-3, AC-7, AC-8, AC-13, AC-15, AC-17, FR-8, FR-12, NFR-1, NFR-6
- **Depends on:** T-2
- **Tests first (TDD):**
  - `src/server/db/MealRepository.test.ts`: create then get returns every field incl. ingredients in order with quantity/unit/name/name_key; NULL calories/cost read back as `null`, not 0; list returns all; `list({favouritesOnly:true})` returns only favourites; `setFavourite` on/off; update replaces ingredients atomically; delete removes meal and ingredients; `existsByName` is case-insensitive and trims, and honours `excludeId`; data survives close and reopen of the file (persistence); create with `sourceUrl` stores it, without stores NULL.
- **Implementation:** `MealRepository` with transactions, row mappers (typed, in `src/shared` types).
- **Done when:** repository tests pass.

### T-4: MealService (validation, duplicates, estimate markers)
- **Satisfies:** AC-11, AC-13, AC-15, AC-19, AC-20, FR-10, FR-11, FR-14, FR-16, FR-12
- **Depends on:** T-1, T-3
- **Tests first (TDD):**
  - `src/server/services/MealService.test.ts`: invalid input yields a validation error listing each missing field; duplicate name without `allowDuplicateName` yields a `DUPLICATE_NAME` result and nothing saved; with the flag it saves; create with `caloriesEstimated: true` and a value stores the marker; `caloriesEstimated: true` with null calories is rejected/ignored; update changing calories clears `calories_estimated`; update leaving calories unchanged keeps it; update changing cost clears only `cost_estimated`; editing only the name keeps both markers; update of the same meal under its own name is not a duplicate.
- **Implementation:** `MealService.create/update/delete/list/get/setFavourite`.
- **Done when:** service tests pass.

### T-5: Meal HTTP API
- **Satisfies:** AC-1, AC-3, AC-11, AC-15, AC-20, FR-1, FR-3, FR-4, FR-12, FR-16
- **Depends on:** T-4
- **Tests first (TDD):**
  - `src/server/http/meals.routes.test.ts`: POST valid returns 201 with body; POST without cook time returns 422 with `fields` containing `cookMinutes`; POST duplicate returns 409 `DUPLICATE_NAME`, again with `allowDuplicateName` returns 201; GET list and `?favourites=true`; PUT favourite toggles; PUT meal returns updated body; DELETE returns 204 then GET returns 404; invalid unit returns 422.
- **Implementation:** routes, schema validation, error mapping, app factory `buildApp({db, providers})`, static serving of the built client, listen on `127.0.0.1` with configurable `PORT`.
- **Done when:** route tests pass.

### T-6: Ingredient line, duration and unit parsing
- **Satisfies:** AC-4, AC-9, AC-12, FR-5
- **Depends on:** T-1
- **Tests first (TDD):**
  - `src/server/import/ingredientLineParser.test.ts`: `"200 g Mehl"` -> 200/g/"Mehl"; `"1,5 kg Kartoffeln"`; `"1 1/2 EL Zucker"` -> 1.5/tbsp; `"2 Eier"` -> 2/piece; `"½ TL Salz"` -> 0.5/tsp; `"Salz nach Geschmack"` -> quantity null, unit null, name kept; unknown unit `"1 Bund Petersilie"` -> quantity null, unit null.
  - `src/server/import/durationParser.test.ts`: `PT30M`=30; `PT1H15M`=75; `P0DT45M`=45; invalid -> null.
- **Implementation:** the two parsers, unit alias table (g, gramm, kg, ml, l, liter, tsp, TL, teaspoon, tbsp, EL, tablespoon, piece, Stück, Stk).
- **Done when:** tests pass.

### T-7: Recipe parsers (JSON-LD and HTML fallback)
- **Satisfies:** AC-4, AC-9, AC-17, AC-23, FR-5, FR-19
- **Depends on:** T-6
- **Tests first (TDD):**
  - `src/server/import/parsers/jsonLdParser.test.ts` (fixtures in `test/fixtures/*.html`): page with JSON-LD `Recipe` yields name, ingredients, prep/cook minutes, `recipeYield` "4 Portionen" -> servings 4; `recipeYield` absent -> servings 4 with `baseServingsNeedsConfirmation`; `@graph` and array forms found; nutrition `calories` "350 kcal" -> 350 per serving; page without JSON-LD returns `null`; JSON-LD of another type returns `null`; instructions and image fields are ignored.
  - `src/server/import/parsers/htmlParser.test.ts`: page without JSON-LD but with an `h1` and an "Zutaten" list yields name and ingredients; page with no recognisable ingredient list returns `null`.
  - `src/server/import/parseRecipe.test.ts`: JSON-LD is used when present even if HTML would also match (AC-9); falls back to HTML otherwise; neither -> `NO_RECIPE_FOUND`.
- **Implementation:** HTML parsing library (cheerio assumed, listed for the user as an implementation detail, not a decision with product impact), `parseRecipe(html, url)`.
- **Done when:** fixtures parse as asserted.

### T-8: RecipeFetcher
- **Satisfies:** AC-6, AC-21, FR-7, FR-17, NFR-7
- **Depends on:** T-1
- **Tests first (TDD):**
  - `src/server/import/RecipeFetcher.test.ts` (local stub HTTP server): 200 HTML returns body; 404/500 -> `UNREACHABLE`; connection refused -> `UNREACHABLE`; non-HTML content type -> `NO_RECIPE_FOUND`; body above 2 MB -> `UNREACHABLE`; aborted signal -> rejects with abort; non-http(s) URL (`file://`) -> `INVALID_URL`.
- **Implementation:** `fetch` with the shared `AbortSignal`, size cap, protocol check.
- **Done when:** tests pass without real network access.

### T-9: Estimators (calories and cost aggregation)
- **Satisfies:** AC-10, AC-18, AC-24, AC-25, FR-9, FR-13, FR-20, NFR-7, NFR-8, NFR-9
- **Depends on:** T-1
- **Tests first (TDD):**
  - `src/server/import/estimators/estimate.test.ts` (fake providers): calories: two ingredients (200 g at 100 kcal/100 g, 100 g at 50 kcal/100 g), 2 servings -> (200+50)/2 = 125 per serving; one ingredient without match -> `null`; ingredient with unit tsp/tbsp/ml/l converted as specified; `piece` without `gramsPerPiece` -> `null`; provider throws -> `null`, no exception escapes; aborted signal -> `null`; cost: pack 500 g at 1.00 EUR, need 250 g -> 0.50; sum over ingredients; one unmatched -> `null`; ingredient with null quantity -> `null`.
  - `src/server/import/estimators/contract.test.ts`: both providers satisfy the interface (a fake can be swapped in without touching `ImportService`).
- **Implementation:** `NutritionProvider`/`PriceProvider` interfaces, `estimateCalories`, `estimateCost`, unit conversion helpers.
- **Done when:** tests pass.

### T-10: Concrete scrapers (nutrition database site and rewe.de)
- **Satisfies:** AC-24, AC-25, FR-20, NFR-9
- **Depends on:** T-9
- **Tests first (TDD):**
  - `src/server/import/estimators/OpenFoodFactsNutritionProvider.test.ts` and `ReweDePriceProvider.test.ts` (recorded response fixtures, no live network): search result fixture yields the expected kcal per 100 g / price and pack size; empty result -> `null`; malformed/changed page -> `null` (not an exception); request uses the abort signal; a rate-limit delay is applied between requests; requests carry an identifying `User-Agent`.
  - Optional manual smoke script (not part of CI) against the live sites.
- **Implementation:** the two providers, selectors isolated in one constants file per provider so site changes are a one-file fix; base URLs overridable by env for the e2e stub.
- **Done when:** fixture tests pass; providers selectable via config.

### T-11: ImportService and import API
- **Satisfies:** AC-4, AC-5, AC-6, AC-9, AC-10, AC-17, AC-18, AC-21, AC-23, FR-5, FR-6, FR-7, FR-9, FR-13, FR-17, FR-19, NFR-3, NFR-7
- **Depends on:** T-7, T-8, T-9, T-5
- **Tests first (TDD):**
  - `src/server/import/ImportService.test.ts` (fake fetcher/providers, fake timers): valid page with calories+cost in JSON-LD -> done, no estimates requested; page missing cost -> draft has `costEstimate` marked as estimate, `totalCostEur` still null; calories provider returns null -> calories stay missing, import still `done` (AC-18); provider throws -> same; slow provider past 30 s -> job `done` with `skippedEstimates`, total elapsed <= 30 s (AC-21); unparseable page -> `failed` `NO_RECIPE_FOUND`; fetch error -> `failed` `UNREACHABLE`; no meal is persisted by any import outcome (AC-4, AC-6); stage transitions are observable while running; page without yield -> `baseServingsNeedsConfirmation`; estimates skipped when an ingredient has null quantity; unknown job id -> not found.
  - `src/server/http/imports.routes.test.ts`: `POST /api/imports` returns 202 with `jobId`; `GET` returns `running` then `done`/`failed`; unknown job id returns 404; malformed URL returns 422.
- **Implementation:** `ImportService`, in-memory job registry (jobs expire after 30 minutes), routes.
- **Done when:** tests pass.

### T-12: Client foundation and API client
- **Satisfies:** NFR-4
- **Depends on:** T-1, T-5
- **Tests first (TDD):**
  - `src/client/api.test.ts`: maps 422 to a field-error object, 409 to a `duplicateName` result, 204 to void; network error surfaces a readable error.
- **Implementation:** React + Vite client build setup, routing (library, add, edit, import), typed `api.ts`, dev proxy to the API.
- **Done when:** client builds; API client tests pass.

### T-13: Meal form (add, edit, review) component
- **Satisfies:** AC-1, AC-5, AC-10, AC-11, AC-12, AC-14, AC-16, AC-19, AC-20, AC-23, FR-1, FR-6, FR-10, FR-16
- **Depends on:** T-12
- **Tests first (TDD):**
  - `src/client/MealForm.test.tsx` (component tests with Testing Library): base servings pre-filled with 4; unit select offers exactly g, kg, ml, l, tsp, tbsp, piece; submitting with empty name/ingredients/cook time shows an error per field and does not call the API; add/remove ingredient rows; prep time empty is allowed; total time shown as prep + cook; duplicate-name 409 shows a warning and a "Save anyway" button which resubmits with the flag; in review mode missing values show a "missing" marker; an estimate proposal shows an "estimate" label with accept/overwrite; accepting sends `caloriesEstimated: true`; typing a different value sends the plain value; servings marked "please confirm" until the user touches/confirms the field.
- **Implementation:** `MealForm` with mode `create|edit|review`.
- **Done when:** component tests pass.

### T-14: Meal library page (list, detail, favourites, delete)
- **Satisfies:** AC-2, AC-3, AC-7, AC-15, AC-16, AC-17, AC-19, FR-2, FR-3, FR-4, FR-12
- **Depends on:** T-12
- **Tests first (TDD):**
  - `src/client/MealLibraryPage.test.tsx`: each meal shows calories per serving, cost in EUR, prep, cook and total minutes; null calories/cost render "missing", never "0"; "estimated" badge shown when flagged and absent otherwise; imported meal shows its source URL as a link, manual meal shows none; star click calls favourite API and updates; "Favourites only" filter shows only favourites and a unmarked meal disappears; delete shows a confirm dialog, cancel makes no API call, confirm calls delete and removes the row.
- **Implementation:** `MealLibraryPage`, `MealCard`, `ConfirmDialog`.
- **Done when:** tests pass.

### T-15: Import page (progress, error handling)
- **Satisfies:** AC-4, AC-5, AC-6, AC-18, AC-21, FR-5, FR-7, NFR-3
- **Depends on:** T-12, T-13
- **Tests first (TDD):**
  - `src/client/ImportPage.test.tsx`: submit URL starts import and shows the current stage; `done` opens the review `MealForm` with the draft and saves nothing yet; `failed` shows a clear message, keeps the URL field for retry and a link to the manual form, and creates no meal; `skippedEstimates` shows a notice that estimates were skipped and the fields are marked missing; empty/invalid URL is rejected client-side.
- **Implementation:** `ImportPage` polling the import job status.
- **Done when:** tests pass.

### T-16: Runtime wiring, persistence smoke and e2e support
- **Satisfies:** AC-7, NFR-1, NFR-4, NFR-5
- **Depends on:** T-5, T-11, T-14, T-15
- **Tests first (TDD):**
  - `src/server/start.test.ts`: starting the server twice against the same DB file shows data created in the first run in the second (AC-7); startup applies migrations; the server binds to 127.0.0.1 only; graceful shutdown closes the database.
- **Implementation:** `src/server/main.ts`, config from env (`PORT`, `MEALPLANNER_DB`, `NUTRITION_BASE_URL`, `PRICE_BASE_URL`, `IMPORT_DEADLINE_MS` default 30000), production build serving the client, `npm start`, e2e start script (`npm run start:e2e`) that boots the app with a fresh temp DB and stub-pointing provider URLs.
- **Done when:** `npm start` serves the full app; the persistence test passes.

### T-17: End-to-end test
- **Satisfies:** all ACs (see E2E section)
- **Depends on:** T-16
- **Tests first (TDD):** the Playwright file described below is the test; implement-epic builds and sets it up.
- **Implementation:** see the E2E section.
- **Done when:** the e2e test file passes against the running app with stubs.

## Traceability

| AC | Tasks | Tests |
|----|-------|-------|
| AC-1 | T-1, T-3, T-4, T-5, T-13 | validation.test (accepts empty calories/cost), MealRepository create/get, meals.routes POST valid, MealForm add, e2e J1 |
| AC-2 | T-14 | MealLibraryPage shows calories/cost/times, "missing" not zero; e2e J1 |
| AC-3 | T-3, T-5, T-14 | MealRepository favourites filter, meals.routes favourite, MealLibraryPage favourites; e2e J2 |
| AC-4 | T-7, T-11, T-15 | parseRecipe tests, ImportService "nothing persisted", ImportPage review; e2e J3 |
| AC-5 | T-11, T-13, T-15 | MealForm review "missing" markers, ImportPage done; e2e J3 |
| AC-6 | T-8, T-11, T-15 | RecipeFetcher errors, ImportService failed, ImportPage failed; e2e J4 |
| AC-7 | T-2, T-3, T-16 | MealRepository reopen, start.test persistence; e2e J1 (restart step) |
| AC-8 | T-1, T-2, T-3 | scaling.test, ingredients stored as REAL + unit (migrations/repo tests) |
| AC-9 | T-7, T-11 | parseRecipe JSON-LD preferred, HTML fallback |
| AC-10 | T-9, T-11, T-13 | estimate tests, ImportService estimate proposal, MealForm accept/overwrite; e2e J3 |
| AC-11 | T-1, T-4, T-5, T-13 | validation.test, MealService invalid input, routes 422, MealForm field errors; e2e J1b |
| AC-12 | T-1, T-2, T-5, T-13 | validation units, migration CHECK, routes invalid unit, MealForm unit select; e2e J1 |
| AC-13 | T-2, T-3, T-4 | migration columns, repository NULL calories/cost, MealService |
| AC-14 | T-1, T-13 | validation servings, MealForm prefilled 4; e2e J1 |
| AC-15 | T-3, T-4, T-5, T-14 | repository update/delete, routes PUT/DELETE, MealLibraryPage delete confirm/cancel; e2e J5 |
| AC-16 | T-1, T-13, T-14 | validation prep optional, MealForm total time, MealLibraryPage times; e2e J1 |
| AC-17 | T-2, T-3, T-7, T-14 | migration no instruction/image column, repository sourceUrl, jsonLd ignores instructions, MealLibraryPage source link; e2e J3 |
| AC-18 | T-9, T-11, T-15 | estimate provider throws/null, ImportService provider null/throws, ImportPage; e2e J3b |
| AC-19 | T-4, T-13, T-14 | MealService marker rules, MealForm accept sends flag, MealLibraryPage badge; e2e J3, J5 |
| AC-20 | T-4, T-5, T-13 | MealService duplicate, routes 409, MealForm save anyway; e2e J1 |
| AC-21 | T-8, T-11, T-15 | RecipeFetcher abort, ImportService 30 s deadline (fake timers), ImportPage skipped notice; e2e J3c |
| AC-22 | T-1, T-3 | normalize.test, repository `name_key` and `existsByName` |
| AC-23 | T-7, T-11, T-13 | jsonLd missing yield, ImportService flag, MealForm "please confirm"; e2e J3 |
| AC-24 | T-9, T-10 | estimate calories sum/divide/unmatched, nutrition provider fixtures; e2e J3 |
| AC-25 | T-9, T-10 | estimate cost sum/unmatched, rewe provider fixtures; e2e J3 |

| FR / NFR | Tasks |
|----------|-------|
| FR-1 | T-1, T-5, T-13 |
| FR-2 | T-14 |
| FR-3 | T-3, T-5, T-14 |
| FR-4 | T-3, T-5, T-14 |
| FR-5 | T-6, T-7, T-11, T-15 |
| FR-6 | T-11, T-13 |
| FR-7 | T-8, T-11, T-15 |
| FR-8 | T-3, T-16 |
| FR-9 | T-9, T-11 |
| FR-10 | T-1, T-4, T-13 |
| FR-11 | T-2, T-4 |
| FR-12 | T-3, T-4, T-5, T-14 |
| FR-13 | T-9, T-11 |
| FR-14 | T-4, T-13 |
| FR-15 | T-2, T-3, T-7, T-14 |
| FR-16 | T-4, T-5, T-13 |
| FR-17 | T-8, T-11 |
| FR-18 | T-1, T-3 |
| FR-19 | T-7, T-11, T-13 |
| FR-20 | T-9, T-10 |
| NFR-1 | T-2, T-3, T-16 |
| NFR-2 | T-1, T-2 |
| NFR-3 | T-11, T-15 |
| NFR-4 | T-1, T-12, T-16 |
| NFR-5 | T-2, T-16 |
| NFR-6 | T-1, T-2, T-3 |
| NFR-7 | T-8, T-9, T-11 |
| NFR-8 | T-9, T-13 |
| NFR-9 | T-9, T-10 |

Mechanical check of AC numbers: AC-1 through AC-25 all appear in the first table.

## E2E Test (Playwright)

The implement-epic skill builds and sets up this test later; this spec only describes it. One file, `e2e/meal-library.spec.ts`, one test per journey including the failure journeys.

**Start and isolation.** `playwright.config.ts` uses `webServer` running `npm run start:e2e` (builds the client, starts the server on port 4173 with `MEALPLANNER_DB` set to a fresh temp file per run, `NUTRITION_BASE_URL` and `PRICE_BASE_URL` pointing to a local stub server, `IMPORT_DEADLINE_MS` default except in J3c). A global setup starts a small stub HTTP server (fixture pages and fake nutrition/price responses) so no real website, including rewe.de and the nutrition site, is ever contacted. Tests run serially against the same app instance; each test creates its own meals with unique names.

**Stub fixtures.**
- `/recipe-jsonld` — page with schema.org Recipe (name "Stub Pasta", 3 ingredients, `PT10M` prep, `PT20M` cook, yield "2 servings", no nutrition, no cost).
- `/recipe-html` — page without JSON-LD, with `h1` and a "Zutaten" list.
- `/recipe-noyield` — JSON-LD without `recipeYield`.
- `/not-a-recipe` — HTML without any recipe.
- `/unreachable` — connection reset / HTTP 500.
- Nutrition stub: returns kcal per 100 g for the stub ingredients, except one named "Unobtanium" (no match). Price stub: returns price and pack size for the same, except "Unobtanium".
- A slow-stub mode (`/slow` page plus nutrition stub delaying 5 s) used with `IMPORT_DEADLINE_MS=2000` in a separate project/config (`webServer` second instance) for J3c.

**J1 — add a meal manually (AC-1, AC-2, AC-11, AC-12, AC-14, AC-16, AC-20, AC-7).**
1. `goto('/')`, click `getByRole('link', {name: 'Add meal'})`.
2. Assert `getByLabel('Base servings')` has value `4`; assert the unit select `getByLabel('Unit')` has exactly the options g, kg, ml, l, tsp, tbsp, piece.
3. Click `getByRole('button', {name: 'Save meal'})` with an empty form: assert error messages visible for name, ingredients, cooking time; assert URL unchanged and library has no new meal (AC-11).
4. Fill name "E2E Soup", ingredient 200 / g / "Carrot", cooking time 30, leave prep, calories, cost empty; save.
5. Assert the library row for "E2E Soup" shows "Calories: missing", "Cost: missing" (not 0), "Prep 0 min", "Cook 30 min", "Total 30 min".
6. Add a second meal with prep 10, cook 20: assert total 30 min shown.
7. Add a third meal also named "E2E Soup": assert warning text "meal with this name already exists" and a button "Save anyway"; click it; assert both appear (AC-20).
8. Restart check: run via a Playwright fixture that stops and restarts the server process on the same DB file, reload, assert "E2E Soup" is still listed (AC-7).

**J2 — favourites (AC-3, AC-7).**
1. Create "E2E Fav" and "E2E Plain".
2. Click `getByRole('button', {name: 'Mark E2E Fav as favourite'})`; assert the button state `aria-pressed=true`.
3. Toggle `getByRole('checkbox', {name: 'Favourites only'})`: assert "E2E Fav" visible, "E2E Plain" not.
4. Unmark "E2E Fav": assert it disappears from the filtered view.
5. Mark again, reload the page (and after the server restart in J1 style), assert it is still favourite.

**J3 — import with estimates (AC-4, AC-5, AC-9, AC-10, AC-17, AC-19, AC-23, AC-24, AC-25).**
1. Open "Import recipe", fill `getByLabel('Recipe URL')` with the stub `/recipe-jsonld` URL, click "Import".
2. Assert a progress status is visible while running; wait for the review form.
3. Assert the library does not contain "Stub Pasta" yet (nothing saved, AC-4).
4. Assert name "Stub Pasta", three ingredient rows, prep 10, cook 20, servings 2; calories and cost fields show an "Estimate" label with the stub-derived values (AC-10, AC-24, AC-25); an ingredient with no match is covered by a second import (`/recipe-unmatched` includes "Unobtanium"): assert calories show "missing" instead of a guess.
5. Accept the calorie estimate; overwrite the cost with 7.50 (typed value, no estimate label afterwards); save.
6. Library shows "Stub Pasta" with an "estimated" badge on calories only, no badge on cost, and the source URL link (AC-17, AC-19).
7. Open edit, change calories, save: assert the badge is gone (AC-19). (Also verifies AC-15 persistence of edits.)
8. Import `/recipe-html` (no JSON-LD): assert the draft contains the HTML-parsed name and ingredients (AC-9).
9. Import `/recipe-noyield`: assert servings `4` with a "please confirm" marker (AC-23); mark it confirmed; assert missing values are visibly marked and fill the cook time if absent (AC-5).

**J3b — scraping fails (AC-18).** Run the nutrition and price stubs in error mode (stub returns 500 / drops connection, toggled through a stub control endpoint): import `/recipe-jsonld`; assert the draft still appears, calories and cost marked "missing", no estimate labels; fill both manually and save; assert no "estimated" badge.

**J3c — 30 s deadline (AC-21).** Using the second app instance with `IMPORT_DEADLINE_MS=2000` and a nutrition stub delaying 5 s: import; assert the review form appears after about 2 s (test timeout 10 s), calories are "missing", and a notice states that estimates were skipped.

**J4 — import fails (AC-6).**
1. Import `/not-a-recipe`: assert an alert (`getByRole('alert')`) with a clear message that the recipe could not be imported; assert the library has no new meal; the URL field is still editable.
2. Import `/unreachable`: same assertions.
3. Click "Add meal manually": assert the add-meal form opens.

**J5 — edit and delete (AC-15).**
1. Create "E2E Edit"; open it; change name to "E2E Edited" and cook time to 45; save; assert the library shows the new values; reload and assert they persisted.
2. Click delete: assert a confirmation dialog (`getByRole('alertdialog')` or `dialog`); click Cancel: meal still listed.
3. Click delete and confirm: meal gone; mark as favourite beforehand and assert it is also absent with "Favourites only".

**AC coverage by e2e.** AC-1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25. AC-8, AC-13 and AC-22 are covered by unit/integration tests only (storage and comparison internals not visible in the UI).

**Selectors.** Prefer accessible roles and labels as given above; the UI must therefore expose those labels (T-13 to T-15 implement them). Fallback `data-testid` attributes only for list rows (`meal-row-<name>`).

## Decision Log

### Cycle 1
- Q: Which test runner for unit and integration tests? → A: Vitest
- Q: Which backend HTTP framework? → A: Fastify
- Q: Which approach for the browser UI? → A: React + Vite SPA
- Q: How does the backend access SQLite and manage schema migrations? → A: better-sqlite3 with hand-written versioned SQL migration files
- Q: Which project structure? → A: Single npm package with `src/server`, `src/client`, `src/shared` folders
- Q: Which public nutrition database website provides per-ingredient calories? → A: Open Food Facts
- Q: How does the UI get import progress within the 30 s budget? → A: POST starts an import job and the UI polls a status endpoint
- Q: How are ingredient quantities stored? → A: REAL decimal column plus a unit enum text column with a CHECK constraint; round only for display

## Open Questions

None — confidence reached 90%.

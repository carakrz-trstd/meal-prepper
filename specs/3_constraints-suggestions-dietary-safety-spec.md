# Spec: Epic 3 — Constraints, Suggestions & Dietary Safety

Confidence: 93%

PRD: [3_constraints-suggestions-dietary-safety.md](3_constraints-suggestions-dietary-safety.md)

## Overview

This spec turns the Epic 3 PRD into an implementable design: meal suggestions within calorie, budget and cooking-time limits (library first, then an on-demand online search), an ingredient blacklist, saved participants with dietary restrictions, and a deterministic, offline dietary check applied to suggestions and to manual planning in Epic 2.

Dependencies (both specs exist and are aligned with this one):
- **Epic 1** ([1_meal-library-recipe-import-spec.md](1_meal-library-recipe-import-spec.md)): tables `meals` (`id`, `name`, `base_servings`, `calories_per_serving` NULL, `calories_estimated`, `total_cost_eur` NULL, `cost_estimated`, `prep_minutes`, `cook_minutes`, `is_favourite`, `source_url` NULL) and `ingredients` (`meal_id`, `position`, `name`, `name_key`, `quantity`, `unit`); shared code `src/shared/normalize.ts` (`normalizeIngredientName`), `types.ts`; importer pieces `RecipeFetcher` and `parseRecipe(html, url)` (JSON-LD first, HTML fallback) under `src/server/import/`; the review form (`MealForm` in review mode, `ImportPage`); migration `001_init.sql`; env `MEALPLANNER_DB`; `npm run start:e2e` on port 4173.
- **Epic 2** ([2_weekly-planning-shopping-list-spec.md](2_weekly-planning-shopping-list-spec.md)): table `planned_meal(id, week_start, day_of_week, meal_id, servings)`, the `assertPlannable(weekStart, day, mealId)` seam in `plan.service.ts`, `PUT /api/plan/:weekStart/days/:day`, `MealPicker`/`ServingsDialog`/`DayCard`/`WeekPlanPage`, `WeekView`, migration `002_weekly_plan.sql`, env `APP_FIXED_DATE`. Epic 3 does not edit Epic 2's code or schema until the final integration tasks T-14 and T-15 (AD-10).

Epic 3 composes a parse-only importer entry point `parseRecipeFromUrl` itself from Epic 1's `RecipeFetcher` and `parseRecipe` (no estimate lookups), so Epic 1 needs no change (AD-9).

Out of scope (as in the PRD): showing calories/cost/time on a meal; creating, importing or editing meals; weekly planning and the shopping list.

## Key Architecture Decisions

| # | Decision | Choice | Rationale | Source |
|---|----------|--------|-----------|--------|
| AD-1 | Application type and stack | Local web app, TypeScript/Node.js backend, browser UI | Fixed by the PRDs | Epic 1 PRD NFR-4; Epic 3 PRD Overview |
| AD-2 | Storage | Embedded SQLite; Epic 3 tables added in migration `003_constraints.sql` next to the Epic 1/2 tables | Fixed by the PRDs | Epic 1 PRD NFR-5 |
| AD-3 | Shared infrastructure | Inherited from Epic 1 and Epic 2: Fastify, React + Vite SPA, better-sqlite3 with numbered SQL migrations (`PRAGMA user_version`), Vitest + React Testing Library + Playwright, single package with `src/server`, `src/client`, `src/shared`, feature folders | Epic 1 is the foundation; one shared stack avoids conflicting choices | Cycle 1 (architecture advisor); Epic 1 spec AD-11 to AD-15 |
| AD-4 | Dietary check | Deterministic, offline, data-driven: table `restriction_keyword(restriction, keyword, effect forbidden\|safe)` seeded by migration; forbidden match = violating, safe match = verified, otherwise unknown; mapping stored as data | The safe list is what lets AC-9 produce "unknown" instead of treating unmatched ingredients as safe | PRD NFR-2, NFR-3, AC-9, AC-20; Cycle 1 (architecture advisor) |
| AD-5 | Predefined restrictions | vegetarian, vegan, gluten-free, lactose-free, nut-free, seafood-free (fixed list, enforced in code and by a DB CHECK) | Fixed by the PRD | PRD AC-20 |
| AD-6 | Blacklist and ingredient matching | Trimmed, case-insensitive (`normalizeIngredientName`); match when the ingredient name equals or contains the blacklisted word; no plural/synonym handling | Fixed by the PRD and Epic 1 | PRD AC-6; Epic 1 PRD AC-22 |
| AD-7 | Online search | Scrape the google.com HTML results page; on captcha/block fall back to the allrecipes.com search page; up to 5 result pages imported in parallel; one shared 30 s cap; no LLM, no account/API key; behind a replaceable adapter | Fixed by the PRD | PRD NFR-4, NFR-5, AC-16, AC-17, AC-27 |
| AD-8 | Parsing search-result pages, delivery of results, cycling state | cheerio with per-site CSS selectors inside each adapter; Server-Sent Events (POST starts a search and returns an id, GET `/events` streams candidates); library matches returned as a full ordered list stepped through by the client, online candidates held in an in-memory search session with TTL | Deterministic, no browser or API key; one-way streaming fits "one by one"; library matches are cheap to recompute and online candidates are throwaway | Cycle 1 (architecture advisor) |
| AD-9 | Importer use at search time | Parse-only: `parseRecipeFromUrl(url, signal)` composes Epic 1's `RecipeFetcher` and `parseRecipe`; no estimate lookups at search time (missing values count as missing, excluded when a limit is set); estimate lookups run only in the Epic 1 review step after the user picks | Per-ingredient scraping for 5 pages would not fit the shared 30 s cap | Cycle 1 (architecture advisor) |
| AD-10 | Integration with Epic 2 | Epic 3 owns its tables and exposes a service/HTTP API; Epic 2 hooks are the final integration tasks T-14/T-15 using Epic 2's `assertPlannable` seam and an extended plan `PUT` body | Epic 3 stays buildable and testable in parallel without editing Epic 2 | Cycle 1 (architecture advisor) |
| AD-11 | Semantics of the limits | Calories per serving; budget = total cost x servings / base servings; time = preparation + cooking minutes; missing value for a set limit excludes the meal; estimated values count and are reported | Fixed by the PRD | PRD AC-1, AC-2, AC-3, AC-12, AC-22 |
| AD-12 | Suggestion order | Verified library matches (favourites first) -> unknown-ingredient library matches (favourites first) -> online matches in the order found; meals planned in the selected week skipped | Fixed by the PRD | PRD AC-9, AC-14, AC-24 |
| AD-13 | Stored warning state | Violations of a planned meal (AC-25) are computed when the plan is read, never stored; only the ticked participants are stored | Always reflects current restrictions/blacklist; no stale data | PRD AC-25 |
| AD-14 | E2E stubbing of external sites | Search-engine and allrecipes base URLs and recipe pages are configurable via environment variables so the e2e test points them at a local stub server | No real scraping in tests; keeps adapters replaceable | PRD NFR-4 |
| AD-15 | Last-request preferences (AC-26) | One-row SQLite table `suggestion_prefs` | Survives restarts, testable server-side (low-impact choice by this spec; localStorage was the alternative) | PRD AC-26 |

## Technical Design

### Data model

Epic 1 and Epic 2 tables are used as described in the Overview. Epic 3 tables (migration `003_constraints.sql`; `PRAGMA foreign_keys = ON` is set per connection by Epic 1):

```sql
CREATE TABLE participant (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0)      -- name only (AC-7)
);
CREATE TABLE participant_restriction (
  participant_id INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  restriction TEXT NOT NULL CHECK (restriction IN
    ('vegetarian','vegan','gluten-free','lactose-free','nut-free','seafood-free')),
  PRIMARY KEY (participant_id, restriction)
);
CREATE TABLE blacklist_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL UNIQUE CHECK (length(term) > 0)     -- stored trimmed + lower-cased
);
CREATE TABLE restriction_keyword (                        -- NFR-3, AD-4
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  restriction TEXT NOT NULL CHECK (restriction IN
    ('vegetarian','vegan','gluten-free','lactose-free','nut-free','seafood-free')),
  keyword TEXT NOT NULL,                                  -- lower-case
  effect TEXT NOT NULL CHECK (effect IN ('forbidden','safe')),
  UNIQUE (restriction, keyword, effect)
);
CREATE TABLE suggestion_prefs (                           -- AC-26, single row id = 1
  id INTEGER PRIMARY KEY CHECK (id = 1),
  calorie_limit INTEGER NULL,
  budget_limit REAL NULL,
  time_limit INTEGER NULL,
  participant_ids TEXT NOT NULL DEFAULT '[]'              -- JSON array
);
CREATE TABLE planned_meal_participant (                   -- AC-25
  planned_meal_id INTEGER NOT NULL REFERENCES planned_meal(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  PRIMARY KEY (planned_meal_id, participant_id)
);
```

Deleting a participant removes their links (cascade); the planned meal's servings are unchanged. Deleting or replacing a planned meal removes its links (cascade; Epic 2 replace rewrites links through T-14).

`restriction_keyword` is seeded by the migration (starter set, extendable by inserting rows; no UI in this epic). Seed examples: vegetarian forbidden: beef, pork, chicken, ham, bacon, lamb, turkey, fish, salmon, tuna, shrimp, gelatin; vegan forbidden: all vegetarian ones plus milk, cheese, butter, cream, yogurt, egg, honey; gluten-free forbidden: wheat, flour (plus safe: "rice flour", "corn flour"), pasta, bread, barley, rye, couscous; lactose-free forbidden: milk, cheese, butter, cream, yogurt (safe: "coconut milk", "almond milk", "oat milk"); nut-free forbidden: nut, almond, hazelnut, walnut, cashew, pistachio, peanut (safe: "nutmeg", "coconut"); seafood-free forbidden: fish, salmon, tuna, shrimp, prawn, crab, lobster, mussel, squid. Each restriction also has `safe` keywords for common plain ingredients (e.g. rice, potato, tomato, onion, carrot, salt, pepper, oil, water, sugar, apple, ...) so ingredients can be verified. Seeds are code-reviewed data; the exact list is part of T-3.

### Modules and components

Pure shared code (`src/shared/constraints/`, used by server and client, no I/O):

| Module | Responsibility |
|---|---|
| `blacklist.ts` | `containsTerm(name, term)`; `findBlacklisted(ingredients, terms): string[]` (matching ingredient names). Uses `normalizeIngredientName` from Epic 1's `src/shared/normalize.ts`. |
| `dietary.ts` | `classifyIngredient(name, restriction, keywords)` -> `violating | verified | unknown` (forbidden evaluated before safe); `checkMeal(meal, participants, keywords)` -> `{ violations: {participant, restriction, ingredient}[], unknownIngredients: string[] }`. A meal with any violation is "violating" regardless of unknowns. With zero participants no dietary check is done. |
| `limits.ts` | `evaluateLimits(meal, limits, servings)` -> `{ ok, excludedBecauseMissing: LimitKey[], usedEstimate: boolean }` (AD-11). |
| `suggest.ts` | `suggestFromLibrary(ctx)` -> ordered match list (AD-12) or an empty result with the applied limits. Pure; takes meals, blacklist, keywords, participants, plannedMealIds, limits, servings. |
| `types.ts` | `Restriction`, `Participant`, `Limits`, `SuggestionMatch`, `OnlineCandidate`, `MealCheckResult`. |

Server (`src/server/constraints/`):

| Module | Responsibility |
|---|---|
| `repo/*.ts` | Repositories: participants, blacklist, restriction keywords, prefs, planned-meal participants (better-sqlite3, hand-written SQL). |
| `parseRecipeFromUrl.ts` | `parseRecipeFromUrl(url, signal): Promise<MealDraft>`: `RecipeFetcher` + `parseRecipe` from Epic 1, source URL set, no estimate lookups, honours the abort signal (AD-9). |
| `search/SearchEngineAdapter.ts` | Interface `SearchEngineAdapter { name; search(query, signal): Promise<string[]> }` returning result URLs; throws `SearchBlockedError` on captcha/block, `SearchFailedError` otherwise. |
| `search/GoogleAdapter.ts`, `search/AllrecipesAdapter.ts` | Fetch and parse the results page with cheerio and per-site selectors (one constants file per adapter); base URL from env (AD-14). Block detection in Google: HTTP 429/403, redirect to `/sorry/`, consent page, body containing "unusual traffic" or captcha markers. |
| `search/FallbackSearch.ts` | Tries Google; on `SearchBlockedError` runs Allrecipes with the remaining time of the same cap. |
| `search/OnlineSearchService.ts` | Runs a search for given limits/participants: builds the query, gets up to 5 URLs, skips URLs equal to a library `source_url`, parses each with `parseRecipeFromUrl` in parallel, runs blacklist/dietary/limit checks, emits matching candidates as they finish, stops at the 30 s deadline (AbortController) and discards unfinished/failed/non-matching ones. |
| `search/SearchSessionStore.ts` | In-memory map `searchId -> { candidates[], status, message }` with TTL (default 30 min). |
| `PlannedMealsPort.ts` | Interface used by suggestions and warnings: `plannedMealIdsForWeek(weekStart)`, `plannedMealsOfWeek(weekStart)`; implemented in T-14 on top of Epic 2's plan repository (a stub in tests). |
| `http/routes.ts` | Fastify routes below with JSON-schema validation; registered next to the Epic 1/2 routes. |

Client (`src/client/constraints/`): `SuggestPanel` (hosted in Epic 2's `MealPicker`), `ParticipantTicks`, `BlacklistPage` (`/blacklist`), `ParticipantsPage` (`/participants`), `PlanWarning`/`PlanWarningDialog`, `constraintsApi.ts`.

### Interfaces (API / adapters)

REST (JSON), prefix `/api`:

| Endpoint | Behaviour |
|---|---|
| `GET/POST /api/participants`, `PUT/DELETE /api/participants/:id` | CRUD; body `{ name, restrictions: Restriction[] }`; 400 for unknown restriction or empty name. |
| `GET/POST /api/blacklist`, `DELETE /api/blacklist/:id` | Add normalised term (duplicate is idempotent 200), remove. |
| `GET/PUT /api/suggestion-prefs` | Last request limits and ticked participant ids; `PUT` with nulls/empty clears (AC-26). |
| `POST /api/suggestions` | Body `{ weekStart, calorieLimit?, budgetLimit?, timeLimit?, participantIds[], servings }`. Saves prefs, returns `{ matches: SuggestionMatch[], appliedLimits, message? }` where `matches` is the full ordered list of library matches and `SuggestionMatch = { mealId, meal summary, favourite, unknownIngredients[], usedEstimate: { calories, cost } }`. Empty -> `message` naming the applied limits (AC-5). |
| `POST /api/suggestions/online` | Same body; starts the search, returns `{ searchId }` immediately. No online request is made unless this is called (AC-16). |
| `GET /api/suggestions/online/:searchId/events` | Server-Sent Events: `candidate` (`{ candidateId, draft summary, unknownIngredients, usedEstimate, sourceUrl }`), `done` (`{ found: n }`), `failed` (`{ message }` for AC-19). Ends within 30 s. |
| `GET /api/suggestions/online/:searchId/candidates/:candidateId` | Returns the full parsed draft for the Epic 1 review step. |
| `POST /api/meals/check` | Body `{ mealId, participantIds[] }` -> `{ violations[], unknownIngredients[], blacklisted[] }`; used by Epic 2's manual planning (AC-8, AC-11, AC-13). |
| `GET /api/plan-warnings?weekStart=` | For each planned meal of the week with stored participants: current `violations`, `unknownIngredients`, `blacklisted` (AC-25). |

Extension of an Epic 2 endpoint (T-14 only): `PUT /api/plan/:weekStart/days/:day` accepts an optional `participantIds: number[]`; the links in `planned_meal_participant` are rewritten in the same transaction on every successful PUT (new, replaced or servings-only). `DELETE` of the day cascades the links.

### Key flows

**Journey 1: Suggestion within limits.**
1. User opens "Suggest a meal" in a day's meal picker; the panel loads `GET /api/suggestion-prefs` (limits and ticked participants pre-filled, a "Clear" button resets them, AC-26). Servings default to the number ticked, editable (AC-15).
2. Submit -> `POST /api/suggestions`. Server loads meals, blacklist, keywords, ticked participants, planned ids of the week; removes planned and blacklisted meals and meals violating a restriction; applies limits (AD-11); orders per AD-12.
3. Client shows match 1 with its flags ("could not verify against the restrictions: <ingredients>", "calories/cost is an estimate"). "Another suggestion" steps through the list, then through online candidates (AC-24). "Plan this meal" hands the meal to Epic 2's planning step.
4. No match -> message "No meal matches" listing the applied limits and the effect of the ticked participants; the "Search online" button stays available (AC-5, AC-19).

**Journey 2: Online search.** User clicks "Search online" -> `POST /api/suggestions/online` -> client opens the event stream. Service: Google adapter (fallback to Allrecipes on block, same deadline, AC-27) -> up to 5 URLs -> skip those equal to a library `source_url` (AC-23) -> parallel `parseRecipeFromUrl` -> checks -> `candidate` events. At 30 s unfinished work is aborted and discarded. No candidates or both engines failing -> `failed`/`done(found: 0)` -> message "online search failed or found nothing"; library matches stay usable (AC-19). Picking a candidate loads its draft into the Epic 1 review step (estimate lookups run there); saving stores it in the library, then the planning step continues (AC-18).

**Journey 3: Blacklist.** Blacklist page lists terms, add and remove; changes apply to the next suggestion; manual planning warns (T-14) and plan-view warnings update (T-15).

**Journey 4: Participants.** Participants page lists participants with restriction checkboxes limited to the six predefined values; add/edit/remove (AC-7, AC-20).

**Journey 5: Dietary check.** When planning (suggestion or manual picker) the user ticks participants; servings pre-fill with the count. Manual planning calls `POST /api/meals/check`; violations show "<participant> — <restriction> (<ingredient>)", blacklist hits show the term; the user may confirm anyway. On confirm the plan `PUT` is sent with `participantIds`, which stores the ticked participants. The plan view calls `GET /api/plan-warnings` and shows a warning on affected meals; nothing is removed (AC-25).

## Implementation Tasks

Tests use Vitest (Fastify `inject` against in-memory SQLite, Testing Library for React) in `tests/constraints/`; shared pure code is tested in `tests/constraints/domain/`. Source paths are `src/shared/constraints/`, `src/server/constraints/` and `src/client/constraints/`.

### T-1: Epic 3 schema, repositories and seed data loader
- **Satisfies:** AC-7, AC-20, AC-25 (storage), FR-7, FR-19 (storage), NFR-3 (storage)
- **Depends on:** Epic 1 T-2 (migration runner), Epic 2 T-1 (`planned_meal`)
- **Tests first (TDD):**
  - `tests/constraints/repo/schema.test.ts`: migration `003` creates all tables on an empty and on an Epic 1+2 database; inserting an unknown restriction fails (CHECK); empty participant name rejected; deleting a participant cascades restrictions and planned_meal_participant rows; deleting a `planned_meal` row cascades its participant links; `suggestion_prefs` accepts only id 1.
  - `tests/constraints/repo/participants.test.ts`: create/read/update/delete a participant stores name and restrictions only (no extra columns).
- **Implementation:** migration SQL (see Data model), repositories with typed functions.
- **Done when:** migration applies; repository tests pass.

### T-2: Blacklist matching
- **Satisfies:** AC-6, AC-13 (matching logic), FR-6
- **Depends on:** Epic 1 T-1 (`normalizeIngredientName`)
- **Tests first (TDD):**
  - `tests/constraints/domain/blacklist.test.ts`: term "nuts" matches "mixed nuts" and "  NUTS "; "nut" matches "walnut" (contains); "nuts" does not match "milk"; empty blacklist matches nothing; multiple terms return each matched ingredient.
- **Implementation:** `src/shared/constraints/blacklist.ts` as pure functions.
- **Done when:** tests pass.

### T-3: Dietary mapping seed and checker
- **Satisfies:** AC-8, AC-9, AC-11 (logic), NFR-2, NFR-3, FR-8, FR-9
- **Depends on:** T-1 (table), T-2
- **Tests first (TDD):**
  - `tests/constraints/domain/dietary.test.ts`: chicken violates vegetarian; "rice flour" is safe for gluten-free while "wheat flour" violates (forbidden evaluated before safe only where keywords overlap, with explicit cases); "coconut milk" safe for lactose-free, "milk" violates; "peanut butter" violates nut-free; "nutmeg" safe for nut-free; vegan forbids egg/honey/cheese; unmatched ingredient ("dragon fruit") is unknown for every restriction; a violation for participant B (not A) is reported with B's name and the restriction; a meal with a violation and an unknown ingredient is "violating"; zero participants -> no check; extending the mapping by inserting a row changes the result without code changes.
  - `tests/constraints/domain/seed.test.ts`: every restriction has at least one forbidden and one safe keyword in the seed.
- **Implementation:** `dietary.ts`; seed rows in the migration per the Data model section.
- **Done when:** tests pass; seed covers the six restrictions.

### T-4: Limit evaluation
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-12, AC-22, FR-1..FR-4, FR-10, FR-16
- **Depends on:** none
- **Tests first (TDD):**
  - `tests/constraints/domain/limits.test.ts`: calories 500 vs 450/500/501 per serving; budget: cost 12 EUR base 4, servings 2 -> 6, limit 6 passes, 5.99 fails; time prep 10 + cook 20 = 30 passes limit 30, fails 29; combined limits require all; missing calories with a calorie limit -> excluded with reason; missing cost ignored when no budget limit is set; `usedEstimate` true when an estimated calories/cost value was used for a set limit, false otherwise; no limits -> always ok.
- **Implementation:** `limits.ts`.
- **Done when:** tests pass.

### T-5: Participants API and page
- **Satisfies:** AC-7, AC-20, AC-21 (participants page), FR-7, FR-15
- **Depends on:** T-1, Epic 1 T-5 (app factory), Epic 1 T-12 (client foundation)
- **Tests first (TDD):**
  - `tests/constraints/http/participants.test.ts`: POST creates; POST with "keto" restriction -> 400; PUT edits name and restrictions; DELETE removes; GET lists with restrictions; response contains no fields besides id, name, restrictions.
  - `tests/constraints/ui/ParticipantsPage.test.tsx`: only the six predefined checkboxes are rendered; add, edit, remove.
- **Implementation:** routes plus page `/participants`.
- **Done when:** user can manage participants on their own page.

### T-6: Blacklist API and page
- **Satisfies:** AC-6, AC-21 (blacklist page), FR-6, FR-15
- **Depends on:** T-1, T-2, Epic 1 T-12
- **Tests first (TDD):**
  - `tests/constraints/http/blacklist.test.ts`: POST " Nuts " stores "nuts"; duplicate does not create a second row; DELETE removes; GET lists.
  - `tests/constraints/ui/BlacklistPage.test.tsx`: add and remove an item on the page.
- **Implementation:** routes plus page `/blacklist`.
- **Done when:** blacklist can be maintained on its own page.

### T-7: Library suggestion engine
- **Satisfies:** AC-1..AC-6, AC-9, AC-10, AC-11, AC-12, AC-14, AC-22, AC-24 (library part), FR-1..FR-5, FR-9..FR-11, FR-18, NFR-1
- **Depends on:** T-2, T-3, T-4
- **Tests first (TDD):**
  - `tests/constraints/domain/suggest.test.ts`: favourites before non-favourites; verified before unknown-ingredient meals (each group favourites first) and unknown meals carry `unknownIngredients`; meals planned in the week skipped; blacklisted meals excluded; meals violating a ticked participant's restriction excluded, unknown ones kept with flag; meals missing a value for a set limit excluded; no matches -> empty list with the applied limits listed; list contains every match once, in stable order; result flags `usedEstimate`.
  - `tests/constraints/domain/suggest.perf.test.ts`: 500 meals with 10 ingredients each and 3 participants are processed in under 100 ms (AC-10, NFR-1).
- **Implementation:** `suggest.ts` pure function plus a server service that loads data via repositories and `PlannedMealsPort`.
- **Done when:** tests pass.

### T-8: Suggestion preferences persistence
- **Satisfies:** AC-26, FR-20
- **Depends on:** T-1
- **Tests first (TDD):**
  - `tests/constraints/http/prefs.test.ts`: `PUT` saves limits and participant ids, `GET` returns them after a new DB connection; `PUT` with nulls and `[]` clears; deleted participants are dropped from the returned ids.
- **Implementation:** repo plus routes.
- **Done when:** tests pass.

### T-9: Suggest API and "Suggest a meal" UI
- **Satisfies:** AC-1, AC-5, AC-9, AC-14, AC-15, AC-21, AC-22, AC-26, FR-11, FR-12, FR-15, FR-16, FR-20
- **Depends on:** T-7, T-8, T-5
- **Tests first (TDD):**
  - `tests/constraints/http/suggestions.test.ts`: `POST /api/suggestions` returns the ordered matches; saves prefs; empty result has a message naming each applied limit; invalid limits (negative, non-numeric) -> 400.
  - `tests/constraints/ui/SuggestPanel.test.tsx`: panel pre-filled from prefs; "Clear" empties it; ticking 3 participants sets servings 3 and the servings stay editable; shows one meal at a time; "Another suggestion" advances and ends in a "no more library matches" state offering online search; unknown flag and estimate note rendered.
- **Implementation:** route; `SuggestPanel` component mounted in Epic 2's `MealPicker` via the integration point of T-14 (until then served on a standalone dev route `/suggest`).
- **Done when:** panel works standalone with library matches.

### T-10: Search adapters with fallback
- **Satisfies:** AC-16, AC-19, AC-27, FR-13, NFR-4, NFR-5
- **Depends on:** none
- **Tests first (TDD):**
  - `tests/constraints/search/google.test.ts`: fixture HTML with results yields URLs (recipe-site links, not google internal links); captcha fixture, 429 and a `/sorry/` redirect throw `SearchBlockedError`; empty results return `[]`.
  - `tests/constraints/search/allrecipes.test.ts`: fixture results page yields recipe URLs.
  - `tests/constraints/search/fallback.test.ts`: blocked Google -> Allrecipes is called; both fail -> `SearchFailedError`; Google OK -> Allrecipes never called; the abort signal is passed through and aborts both.
  - Fixtures under `tests/fixtures/search/`.
- **Implementation:** interface, two cheerio adapters, `FallbackSearch`; base URLs from env `SEARCH_GOOGLE_BASE_URL`, `SEARCH_ALLRECIPES_BASE_URL`; realistic browser User-Agent/Accept-Language headers; no API key.
- **Done when:** adapter tests pass against fixtures.

### T-11: Online search service
- **Satisfies:** AC-16, AC-17, AC-19, AC-23, AC-27, FR-13, FR-14 (checks), FR-17, NFR-4
- **Depends on:** T-7 (checks), T-10, Epic 1 T-7 and T-8 (`parseRecipe`, `RecipeFetcher`)
- **Tests first (TDD):**
  - `tests/constraints/search/parseRecipeFromUrl.test.ts` (stub HTTP server and Epic 1 fixtures): returns the JSON-LD draft with source URL set; HTML fallback works; no estimate provider is called; an aborted signal rejects; unparsable page -> `NO_RECIPE_FOUND`.
  - `tests/constraints/search/online-service.test.ts` (fake adapter, fake parser, fake clock): at most 5 URLs imported, in parallel; URL equal to a library `source_url` skipped and never fetched; candidate emitted as soon as its import finishes and passes limits/blacklist/dietary; failing, unparsable, blacklisted, violating, limit-failing results discarded; unknown-ingredient results kept and flagged; imports unfinished at 30 s are aborted and discarded and the search ends; Google blocked -> Allrecipes used within the same 30 s budget; both engines fail -> status failed with the "failed or found nothing" message; no network call is made before `start()`.
  - `tests/constraints/search/session-store.test.ts`: candidates retrievable by id; expired sessions removed; unknown id -> not found.
- **Implementation:** `parseRecipeFromUrl.ts`, `OnlineSearchService`, `SearchSessionStore`; limits are applied after import (AC-17), the query is built from the ticked participants' restrictions as words plus a fixed term (`"<restrictions joined by space> dinner recipe"`, default "dinner recipe").
- **Done when:** tests pass.

### T-12: SSE endpoint and "Search online" UI
- **Satisfies:** AC-16, AC-19, AC-24 (online part), FR-13, FR-18
- **Depends on:** T-11, T-9
- **Tests first (TDD):**
  - `tests/constraints/http/online-events.test.ts`: `POST /api/suggestions/online` returns a search id without calling adapters until the service starts; the event stream emits `candidate` events one by one, then `done`; failure emits `failed` with the message; stream closes at the cap; unknown id -> 404.
  - `tests/constraints/ui/SearchOnline.test.tsx`: no request until the button is clicked; progress state shown; candidates appended to the "Another suggestion" sequence after library matches in order found (EventSource faked); failure message shown while library matches stay usable.
- **Implementation:** routes plus client `EventSource` handling.
- **Done when:** results appear one by one in the panel.

### T-13: Pick an online recipe -> review -> save -> plan
- **Satisfies:** AC-18, FR-14
- **Depends on:** T-12, Epic 1 T-13 and T-15 (`MealForm` review mode, `ImportPage`)
- **Tests first (TDD):**
  - `tests/constraints/ui/PickOnline.test.tsx`: picking a candidate opens the Epic 1 review form pre-filled with the draft (estimates are looked up by Epic 1 there); the meal is not in the library before save; after save it exists with its source URL and the planning step continues with it; cancelling the review leaves the library unchanged.
  - `tests/constraints/http/candidate.test.ts`: `GET .../candidates/:id` returns the stored draft.
- **Implementation:** candidate endpoint; hand-off to Epic 1's review component; after save continue the planning flow.
- **Done when:** a picked online recipe ends up saved and planned.

### T-14: Epic 2 integration: dietary and blacklist check when planning
- **Satisfies:** AC-8, AC-11, AC-13, AC-15, AC-21, FR-8, FR-12, FR-15, FR-19 (storage hook)
- **Depends on:** T-3, T-5, T-6, T-9, Epic 2 T-5, T-7 and T-11
- **Tests first (TDD):**
  - `tests/constraints/http/check.test.ts`: `POST /api/meals/check` returns violations naming participant, restriction and ingredient for any ticked participant; unknown ingredients listed; blacklisted terms listed; no ticked participants -> only blacklist result.
  - `tests/constraints/http/planned-participants.test.ts`: `PUT /api/plan/:weekStart/days/:day` with `participantIds` stores the links; a replace or servings-only PUT rewrites them; deleting the day removes them (FK cascade); a PUT without `participantIds` leaves existing links untouched; unknown participant id -> 400.
  - `tests/constraints/ui/PlanWarning.test.tsx`: manual planning shows the warning and a "Confirm anyway" button; confirming plans the meal; cancelling plans nothing; servings pre-filled with the number ticked and editable.
- **Implementation:** endpoint; `PlannedMealsPort` implementation on top of Epic 2's plan repository; extension of Epic 2's `PUT` body and service (`participantIds`), keeping `assertPlannable` unchanged; Epic 2 client touchpoints: (1) the day's `MealPicker` hosts a "Suggest a meal" button and the `SuggestPanel`, (2) `ParticipantTicks` next to the servings input with servings pre-fill, (3) the pre-confirmation warning dialog, (4) the plan request carries `participantIds`. Done last, after Epic 2.
- **Done when:** manual planning warns and stores participants.

### T-15: Plan-view warnings
- **Satisfies:** AC-25, FR-19
- **Depends on:** T-14, Epic 2 T-10
- **Tests first (TDD):**
  - `tests/constraints/http/plan-warnings.test.ts`: planned meal with ticked participant A; after adding a restriction to A that the meal violates, the endpoint reports the violation; after adding a blacklist term matching an ingredient it reports it; removing the restriction clears it; the planned meal is never removed; meals without stored participants report only blacklist hits.
  - `tests/constraints/ui/PlanViewWarning.test.tsx`: warning badge on the affected day only.
- **Implementation:** endpoint and a warning component rendered in Epic 2's `DayCard`.
- **Done when:** the plan view warns after restriction/blacklist changes.

### T-16: E2E test
- **Satisfies:** all journeys; see the E2E section.
- **Depends on:** T-1..T-15
- **Tests first (TDD):** the e2e file is described below and is built by implement-epic.
- **Implementation:** see E2E Test (Playwright).
- **Done when:** the Playwright file passes against the app with the stub server.

## Traceability

| AC | Tasks | Tests |
|----|-------|-------|
| AC-1 | T-4, T-7, T-9 | limits.test (calories), suggest.test, e2e J1 |
| AC-2 | T-4, T-7 | limits.test (budget scaling), suggest.test |
| AC-3 | T-4, T-7 | limits.test (time) |
| AC-4 | T-4, T-7 | limits.test (combined), e2e J1 |
| AC-5 | T-7, T-9 | suggest.test (empty), suggestions.test (message), e2e J1-no-match |
| AC-6 | T-2, T-6, T-7 | blacklist.test, blacklist http test, e2e J3 |
| AC-7 | T-1, T-5 | schema.test, participants.test, e2e J4 |
| AC-8 | T-3, T-14 | dietary.test, check.test, e2e J5 |
| AC-9 | T-3, T-7, T-9 | dietary.test (unknown), suggest.test, SuggestPanel.test, e2e J1 |
| AC-10 | T-7 | suggest.perf.test |
| AC-11 | T-3, T-7, T-14 | dietary.test, suggest.test, PlanWarning.test, e2e J5 |
| AC-12 | T-4, T-7 | limits.test (missing), suggest.test |
| AC-13 | T-2, T-14 | blacklist.test, check.test, e2e J3 |
| AC-14 | T-7, T-9 | suggest.test (order, planned skipped), SuggestPanel.test, e2e J1 |
| AC-15 | T-9, T-14 | SuggestPanel.test (servings), PlanWarning.test, e2e J5 |
| AC-16 | T-10, T-11, T-12 | online-service.test (no call before start), online-events.test, e2e J2 |
| AC-17 | T-11 | online-service.test (checks, 30 s cap), parseRecipeFromUrl.test (no estimate calls) |
| AC-18 | T-13 | PickOnline.test, e2e J2 |
| AC-19 | T-10, T-11, T-12 | fallback.test, online-service.test, SearchOnline.test, e2e J2-fail |
| AC-20 | T-1, T-5 | schema.test, participants http/ui tests |
| AC-21 | T-5, T-6, T-9, T-14 | ParticipantsPage/BlacklistPage tests, SuggestPanel.test, e2e J1/J3/J4 |
| AC-22 | T-4, T-9 | limits.test (usedEstimate), SuggestPanel.test |
| AC-23 | T-11 | online-service.test (skip same source URL) |
| AC-24 | T-7, T-9, T-12 | suggest.test, SuggestPanel.test, SearchOnline.test, e2e J2 |
| AC-25 | T-1, T-14, T-15 | schema.test, planned-participants.test, plan-warnings.test, e2e J5 |
| AC-26 | T-8, T-9 | prefs.test, SuggestPanel.test, e2e J1 |
| AC-27 | T-10, T-11 | google.test, fallback.test, online-service.test, e2e J2-fallback |

| FR / NFR | Tasks |
|----------|-------|
| FR-1, FR-2, FR-3, FR-4 | T-4, T-7 |
| FR-5 | T-7, T-9 |
| FR-6 | T-2, T-6 |
| FR-7 | T-1, T-5 |
| FR-8 | T-3, T-14 |
| FR-9 | T-3, T-7 |
| FR-10 | T-4, T-7 |
| FR-11 | T-7, T-9 |
| FR-12 | T-9, T-14 |
| FR-13 | T-10, T-11, T-12 |
| FR-14 | T-11, T-13 |
| FR-15 | T-5, T-6, T-9, T-14 |
| FR-16 | T-4, T-9 |
| FR-17 | T-11 |
| FR-18 | T-7, T-12 |
| FR-19 | T-1, T-14, T-15 |
| FR-20 | T-8, T-9 |
| NFR-1 | T-7 (perf test) |
| NFR-2 | T-3, T-7 |
| NFR-3 | T-1, T-3 |
| NFR-4 | T-10, T-11 |
| NFR-5 | T-10, T-11 (no LLM, no key; adapter tests use plain HTTP) |

Mechanical check: PRD ACs 1-27 all appear in the first table.

## E2E Test (Playwright)

The implement-epic skill builds and sets up this test later; this spec only describes it. One file `e2e/epic3-constraints-suggestions.spec.ts`, using the Epic 1 and Epic 2 pages (their selectors per their specs) and the same start setup.

**Start and fixtures.** Start the app with the Epic 1 script `npm run start:e2e` (port 4173) with `MEALPLANNER_DB` set to a fresh temporary SQLite file, `APP_FIXED_DATE=2026-10-14` (Epic 2), and `SEARCH_GOOGLE_BASE_URL`, `SEARCH_ALLRECIPES_BASE_URL`, `NUTRITION_BASE_URL`, `PRICE_BASE_URL` pointing to a local **stub server** started in Playwright `globalSetup`. Meals are seeded through `POST /api/meals`: "Chicken Curry" (450 kcal/serving, 12 EUR base 4, prep 25 + cook 20, chicken), "Veggie Pasta" (520 kcal, 8 EUR, 10+15 min, pasta, tomato, favourite), "Lentil Soup" (300 kcal, 6 EUR, 10+30 min, lentils, carrot), "Mystery Stew" (400 kcal, 9 EUR, 10+20 min, "dragon fruit"), "No Cost Salad" (200 kcal, cost missing, 0+15 min, lettuce), "Nutty Bar" (350 kcal, 5 EUR, 0+5 min, "mixed nuts"); one imported-style meal with `sourceUrl` equal to one stub recipe URL (for AC-23). No participants are seeded (created in tests). The stub serves fake `google` and `allrecipes` search pages and recipe pages with schema.org data, plus the Epic 1 nutrition/price stubs needed by the review step. Stub modes are switched per test via a control endpoint: `google=results|captcha|429|empty`, `allrecipes=results|error`, `slowRecipe=<ms>`, with a request counter per route. No real website is contacted.

**Tests (one per journey, plus failure paths):**
1. *J1 suggestion within limits* — ACs 1, 2, 4, 5, 9, 14, 22, 26. Open the plan, a day's meal picker, click role button "Suggest a meal". Set calorie limit 500 and time limit 45; submit. Assert "Veggie Pasta" (520 kcal) never appears although it is a favourite, and that the first shown meal is a verified match ("Chicken Curry" or "Lentil Soup"); click "Another suggestion" and assert the next meal differs, and "Mystery Stew" appears after verified meals with text "could not verify" and "dragon fruit"; "No Cost Salad" never appears when a budget limit is set. Set a budget limit of 1 EUR -> assert a message "No meal matches" listing calorie, budget and time limits. Reload the panel and assert the last limits are pre-filled; click "Clear" and assert the fields are empty.
2. *J2 online search* — ACs 16, 17, 18, 19, 23, 24, 27. With stub `google=results` (5 URLs, one equal to an existing library `source_url`, one unparsable, one containing a blacklisted ingredient): assert no request reaches the stub before the click (stub request counter = 0), click "Search online", assert candidates appear one by one (stub delays staggered), the library-duplicate/unparsable/blacklisted ones never appear, "Another suggestion" shows library matches first then online ones in arrival order; pick one -> Epic 1 review form is shown pre-filled, save -> meal in library, planning continues. Variant `google=captcha`: assert results from the allrecipes stub appear without user action (AC-27). Variant `google=captcha, allrecipes=error`: assert the message "online search failed or found nothing" and that library suggestions are still usable (AC-19). Variant `slowRecipe=40000`: assert the search ends within about 30 s with only finished results (AC-17).
3. *J3 blacklist* — ACs 6, 13, 21. On `/blacklist` add "nuts"; request a suggestion with no limits and assert "Nutty Bar" never appears across all "Another suggestion" clicks; plan "Nutty Bar" manually and assert the warning naming "nuts" and confirm anyway; remove "nuts" and assert "Nutty Bar" can be suggested.
4. *J4 participants* — ACs 7, 20, 21. On `/participants` add "Anna" with "vegetarian"; assert the restriction options are exactly the six predefined; edit to add "nut-free"; add "Ben"; remove "Ben"; reload and assert persistence.
5. *J5 dietary check* — ACs 8, 11, 15, 25. Tick "Anna" (vegetarian) in a suggestion request: assert "Chicken Curry" never appears and servings pre-fill with 1; add "Ben" (gluten-free) so servings pre-fill 2, change servings to 3. Plan "Chicken Curry" manually with Anna ticked: assert a warning names "Anna", "vegetarian" and "chicken", confirm anyway, assert the meal is planned. Plan "Veggie Pasta" with Ben ticked: warning for gluten-free. After planning with Anna ticked a meal that is currently fine, add "lentils" to the blacklist and assert the plan view shows a warning on that day while the meal stays planned; remove it and assert the warning disappears.

**Selectors:** accessible roles and labels (buttons "Suggest a meal", "Another suggestion", "Search online", "Clear"; textboxes "Calorie limit", "Budget limit (EUR)", "Cooking time limit (min)"; checkboxes by participant name; status region role `status` for messages; list items for blacklist/participants). Stable `data-testid` only where no role fits (candidate list).

## Decision Log

### Cycle 1
- Q: Which shared infrastructure (HTTP framework, test runner, SQLite access/migrations, UI approach) does Epic 3 use? → A: Epic 3 adopts whatever the Epic 1 spec decides and only lists them as inherited
- Q: How are the search-result HTML pages (google.com, allrecipes.com) parsed to extract result links? → A: cheerio with per-site CSS selectors inside each adapter
- Q: How do online results appear one by one in the browser within the 30 s cap? → A: Server-Sent Events: POST starts the search and returns an id, GET `/events` streams candidates
- Q: How is the "another suggestion" cycling state kept? → A: Stateless for the library (full ordered list, client steps through it); online candidates in an in-memory server-side search session with TTL
- Q: What is the data model of the dietary mapping (NFR-3)? → A: SQLite table `restriction_keyword(restriction, keyword, effect: forbidden|safe)` seeded by migration
- Q: Does the online search's import of up to 5 result pages include Epic 1's scraped calorie/cost estimate lookups? → A: No: parse-only at search time; estimate lookups run only in the Epic 1 review step after the user picks
- Q: How does Epic 3 integrate with Epic 2's planning? → A: Epic 3 owns its tables and exposes a service/HTTP API; Epic 2 hooks are one final integration task listing the exact touchpoints
- Alignment with the Epic 1 and 2 specs (no question): working names replaced by `meals`/`ingredients`/`planned_meal`; migration `003_constraints.sql` with the `planned_meal_participant` FK defined directly (no table rebuild); folders `src/shared/constraints`, `src/server/constraints`, `src/client/constraints`; `parseRecipeFromUrl` composed in Epic 3 from Epic 1's `RecipeFetcher` and `parseRecipe` (no change to Epic 1); Epic 2's plan `PUT` extended with `participantIds` in T-14; env vars and start script as in Epic 1/2

## Open Questions

None — confidence reached 90%.

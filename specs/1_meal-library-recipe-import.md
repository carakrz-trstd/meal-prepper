# PRD: Epic 1 — Meal Library & Recipe Import

Confidence: 91%

## Overview

Epic 1 is the foundation of the Weekly Meal Planner & Shopping List. It provides a persistent collection of meals, each with the data that Epics 2 and 3 depend on: ingredients with scalable quantities, calories, total cost and cooking time. Users can add, edit and delete meals, mark favourites, and import a recipe from an online source. The application is a local web app (runs in the browser) with a TypeScript/Node.js backend.

**In scope**
- Adding, editing and deleting meals (name, base servings, ingredients with quantity and unit, calories per serving, total cost, preparation and cooking time).
- Showing calories, total cost and time on every meal.
- Marking/unmarking favourites and viewing/filtering favourites.
- Importing a recipe from an online source, with a review step before saving, web-scraped estimates for missing calories/cost, and a clear error when parsing fails.
- Persistence of meals between sessions.

**Out of scope (other epics)**
- Weekly planning, servings per planned meal and the shopping list (Epic 2).
- Suggestions within limits, ingredient blacklist and dietary restrictions (Epic 3).

**Dependencies:** none. Epics 2 and 3 depend on this epic's meal data.

## User Journeys

### Journey 1: Add a meal manually
1. The user chooses to add a new meal.
2. The user enters the name, the base number of servings (default 4), the ingredients (each with a number and a unit chosen from the fixed list g, kg, ml, l, tsp, tbsp, piece), and the times in minutes: cooking time (mandatory) and preparation time (optional, counts as 0 if empty). Calories per serving and total cost in EUR are optional.
3. The user saves the meal. If a meal with the same name already exists, the user is warned and may save anyway. Missing optional values are flagged on the meal.
4. The meal appears in the meal library showing its calories per serving, total cost and times.

### Journey 2: Mark a meal as favourite
1. The user opens the meal library.
2. The user marks a meal as a favourite.
3. The meal is visibly marked; the user can filter the library to show only favourites.
4. The user can unmark the meal at any time.

### Journey 3: Import a recipe from an online source
1. The user chooses to import a recipe and provides the online source.
2. The system parses the recipe into a meal draft (name, ingredients, source URL, and calories/cost/time where available). It reads the page's structured recipe data first and falls back to parsing the page's HTML when none exists.
   If the page gives no yield, base servings is pre-filled with 4 and marked for the user to confirm.
3. If calories or cost are missing, the system tries to find them by scraping the web and proposes the result, clearly shown as an estimate: calories come from a public nutrition database website, looked up per ingredient, scaled to the quantities, summed and divided by the base servings; cost comes from the ingredient prices on one configured online supermarket (rewe.de), summed for the quantities. Ingredients without a match leave the value missing. The whole import, including scraping, takes at most 30 seconds; after that remaining estimates are skipped and left for manual entry.
4. The user reviews the draft, confirms or corrects the estimates, and fills in any other missing values.
5. The user saves; the meal appears in the library. Confirmed estimates carry an "estimated" marker until the user edits the value.

### Journey 4: Import fails
1. The user provides an online source that cannot be parsed (unreachable, or no recipe found).
2. The system shows a clear error explaining that the recipe could not be imported.
3. The user can retry with another source or add the meal manually instead.

### Journey 5: Edit or delete a meal
1. The user opens a meal from the library.
2. The user edits any value (including completing missing values) and saves, or deletes the meal.
3. Deleting asks for confirmation; after confirming, the meal is gone from the library.

## Acceptance Criteria

- AC-1: Given the add-meal form, when the user enters a name, base servings, at least one ingredient with number and unit, and a cooking time and saves, then the meal appears in the library with all entered data. Calories and cost may be left empty.
- AC-2: Given a meal in the library, when the user views it (in list or detail), then calories per serving, total cost (EUR) and times are shown; a missing calories or cost value is shown as missing, not as zero.
- AC-3: Given a meal, when the user marks it as favourite, then it is shown as favourite and appears when the favourites filter is active; when the user unmarks it, it no longer appears in that filter.
- AC-4: Given a supplied online recipe source with a recognisable recipe, when the user starts the import, then a draft meal with name and ingredients (and calories/cost/time where the source provides them) is shown for review before anything is saved.
- AC-5: Given an import draft with missing values (e.g. no cost), when the user is in the review step, then the missing values are clearly marked and the user can fill them in before saving.
- AC-6: Given a source that cannot be parsed, when the user starts the import, then a clear error message is shown and no meal is created.
- AC-7: Given a meal has been saved, when the application is closed and reopened, then the meal and its favourite status are still present.
- AC-8: Given a saved meal, then each ingredient's quantity and unit are stored in a form that can be scaled to a different number of servings without loss of meaning (e.g. a doubling of servings doubles the amounts).
- AC-9: Given a recipe page with schema.org recipe data, when it is imported, then the draft is taken from that data; given a page without it, then the system attempts to parse the page HTML.
- AC-10: Given an import draft missing calories or cost, when the draft is shown, then a value found by scraping the web is proposed, labelled as an estimate, and is only saved if the user confirms it (or overwrites it).
- AC-11: Given a meal without a name, without any ingredient, or without a cooking time, when the user tries to save, then saving is refused and the missing fields are indicated.
- AC-12: Given a meal's ingredient, when the user selects the unit, then the unit can only be chosen from the fixed list: g, kg, ml, l, tsp, tbsp, piece.
- AC-13: Given any meal, then its total cost is stored as a single amount in EUR for the meal at its base number of servings, and its calories are stored per single serving.
- AC-14: Given the add-meal form, then base servings is a mandatory whole number pre-filled with 4.
- AC-15: Given a saved meal, when the user edits it and saves, then the changes are shown and persisted; when the user deletes it and confirms, then it is removed from the library and favourites; when the user cancels the confirmation, nothing is deleted.
- AC-16: Given a meal with preparation time and cooking time, then both are entered and shown in minutes and the total time (their sum) is derived and shown; an empty preparation time counts as 0.
- AC-17: Given an imported meal, then its source URL is stored and shown; manually added meals have no source URL; no instructions or images are stored.
- AC-18: Given the web scraping for estimates fails or finds nothing (offline, source unavailable, no match), when the draft is shown, then the import continues, the affected fields stay marked as missing and the user can fill them in manually.
- AC-19: Given a confirmed scraped estimate, when the meal is saved, then the value carries an "estimated" marker that stays visible until the user edits that value, after which the marker is removed.
- AC-20: Given a name that matches an existing meal, when the user saves, then a warning is shown and the user can still save anyway.
- AC-21: Given an import that is still running after 30 seconds in total, then remaining estimate lookups are skipped, the affected fields stay marked as missing, and the draft is shown for manual completion.
- AC-22: Given ingredient names that differ only by leading/trailing whitespace or letter case, then they are treated as the same ingredient; no plural or synonym matching is applied.
- AC-23: Given an imported recipe whose page gives no yield, when the draft is shown, then base servings is pre-filled with 4 and marked for the user to confirm.
- AC-24: Given an imported draft missing calories, when calories are estimated, then each ingredient is looked up in a public nutrition database website, scaled to its quantity, the results are summed and divided by the base servings; if any ingredient has no match, the calories stay missing instead of being guessed.
- AC-25: Given an imported draft missing cost, when cost is estimated, then ingredient prices are taken from one configured online supermarket (rewe.de) and summed for the quantities; if any ingredient has no match, the cost stays missing instead of being guessed.

## Functional Requirements

- FR-1: The user can add a meal with name, base number of servings, ingredients (each with a number and a unit from a fixed list), preparation and cooking time, and optionally calories per serving and total cost. (AC-1, AC-11, AC-12, AC-14, AC-16)
- FR-2: Calories per serving, total cost and times are shown on every meal; missing values are shown as missing. (AC-2, AC-16)
- FR-3: The user can mark and unmark a meal as favourite. (AC-3)
- FR-4: The user can view and filter the meal library by favourites. (AC-3)
- FR-5: The user can import a recipe from an online source; the system parses it into a draft meal (name, ingredients, source URL, and calories/cost/time where available) using the page's structured recipe data first and HTML parsing as fallback. (AC-4, AC-9, AC-17)
- FR-6: Before saving an imported meal, the user can review, correct and complete the draft, with missing values clearly marked. (AC-4, AC-5)
- FR-7: When a recipe cannot be parsed, the system shows a clear error and creates no meal. (AC-6)
- FR-8: Meals and their favourite status persist between sessions. (AC-7)
- FR-9: For an imported draft missing calories or cost, the system tries to obtain an estimate by scraping the web and proposes it; the user must confirm it before it is saved. (AC-10)
- FR-10: Name, at least one ingredient and the required time values are mandatory to save a meal; calories and cost are optional and flagged when missing. (AC-11)
- FR-11: Total cost is entered as a single amount in EUR for the whole meal at its base servings; calories are entered per single serving. (AC-13)
- FR-12: The user can edit and delete saved meals; deleting requires confirmation. (AC-15)
- FR-13: When scraping an estimate is unavailable or finds nothing, the import continues and the fields stay marked as missing for manual entry. (AC-18)
- FR-14: Confirmed estimates are stored with an "estimated" marker that remains until the user edits the value. (AC-19)
- FR-15: Imported meals store their source URL; no cooking instructions or images are stored. (AC-17)
- FR-16: Saving a meal whose name already exists shows a warning and still allows saving. (AC-20)
- FR-17: Imports are limited to 30 seconds in total; unfinished estimate lookups are skipped. (AC-21)
- FR-18: Ingredient names are compared after trimming and case-insensitively; no plural or synonym handling. (AC-22)
- FR-19: Imported recipes without a yield get base servings 4, marked for confirmation. (AC-23)
- FR-20: Missing calories are estimated per ingredient from a public nutrition database website, summed and divided by base servings; missing cost is estimated from rewe.de ingredient prices, summed. Unmatched ingredients leave the value missing. (AC-24, AC-25)

## Non-Functional Requirements

- NFR-1: Meals persist between sessions; no data is lost on normal application shutdown. (AC-7)
- NFR-2: Ingredient quantities and units are stored so that scaling to a different number of servings is possible. (AC-8)
- NFR-3: Imports give feedback to the user while running and finish or fail within 30 seconds in total. (AC-21)
- NFR-4: The application is a local web app that runs in the browser, with a TypeScript backend on Node.js and a browser UI.
- NFR-5: Meals are stored in an embedded SQLite database file.
- NFR-6: Quantity, unit and ingredient name are stored as separate structured fields to support scaling (Epic 1), merging (Epic 2) and filtering (Epic 3).
- NFR-7: Web scraping for estimates must not block the app: failures and slow sources degrade to manual entry. (AC-18)
- NFR-8: Scraped estimates are approximate (e.g. unit conversion, pack-size pricing); they are always labelled as estimates and never saved without user confirmation. (AC-10, AC-19)
- NFR-9: The scrapers for nutrition and price data are replaceable without changing the rest of the app, since source sites change and may restrict scraping. The specific nutrition database website is chosen at implementation time.

## Decision Log

### Cycle 1
- Q: What kind of application is the meal planner? → A: Local web app (runs in the browser)
- Q: Where are meals stored between sessions? → A: Embedded SQLite database file
- Q: How is a recipe parsed from an online source? → A: Schema.org structured data first, fall back to heuristic HTML parsing
- Q: How are missing calories/cost values of an imported recipe handled? → A: Estimate with an LLM, user confirms (differs from the recommended option; superseded in Cycle 2 by Q9)
- Q: How are ingredient quantities and units entered and stored? → A: Number plus unit chosen from a fixed list
- Q: What do "calories" and "total cost" of a meal refer to? → A: Per serving for calories, whole meal for cost
- Q: Which fields are mandatory to save a meal? → A: Name, ingredients and cooking time mandatory; calories and cost optional
- Q: How is cost entered, and in which currency? → A: A single total amount per meal in one fixed currency (EUR)

### Cycle 2
- Q: How does the app access an LLM for the calorie/cost estimate? → A: "Get the information by scraping the web" (own answer; no LLM is used — this replaces the LLM estimate chosen in Q4, so the requirements now say "scraped estimate")
- Q: Which stack is used for the local web app? → A: TypeScript end to end (Node.js backend, browser UI)
- Q: What are the base servings of a meal? → A: Mandatory whole number entered per meal, default 4 in the form
- Q: Can the user edit and delete saved meals? → A: Yes, both edit and delete (delete asks for confirmation)
- Q: How is cooking time entered and shown? → A: Separate preparation and cooking time in minutes, total derived
- Q: Which extra recipe data does a meal store? → A: Source URL for imported meals only; no instructions or images
- Q: What happens when the estimate is unavailable? → A: Import continues, fields stay marked as missing, user fills them in manually
- Q: How is an estimate marked after the user confirms it? → A: Stored with an "estimated" marker that stays visible until the user edits the value

### Cycle 3
- Q: Where does scraped calorie data come from? → A: A public nutrition database website, looked up per ingredient (quantity-scaled, summed, divided by base servings)
- Q: Where does the scraped cost (EUR) come from? → A: Prices of the ingredients scraped from one configured online supermarket (rewe.de), summed for the quantities
- Q: Maximum time of an import? → A: 30 seconds in total; remaining estimates skipped afterwards
- Q: Same-name meal? → A: Warn the user and let them save anyway
- Q: Ingredient name normalisation? → A: Trimmed and case-insensitive match; no plural or synonym handling
- Q: Which units are in the fixed list? → A: g, kg, ml, l, tsp, tbsp, piece
- Q: Base servings of an imported recipe without yield? → A: Pre-filled with 4 and marked for confirmation
- Q: Which time values are mandatory? → A: Cooking time mandatory, preparation time optional (0 if empty)

## Open Questions

None — confidence reached 90%.

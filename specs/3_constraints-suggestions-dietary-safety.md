# PRD: Epic 3 — Constraints, Suggestions & Dietary Safety

Confidence: 92%

## Overview

Epic 3 lets the user get a meal suggestion within a calorie, budget or cooking-time limit, keep an ingredient blacklist, and enter dietary restrictions per participant so that every meal is checked against everyone who eats it. It builds on the meal data from Epic 1 (calories per serving, total cost in EUR for the base servings, preparation and cooking time in minutes, ingredients with trimmed, case-insensitive names, some values marked as estimated or missing) and plugs into the planning flow from Epic 2 (one meal per day, servings 1–20). The application is the local web app (TypeScript/Node.js, SQLite).

Suggestions come from the user's own meal library and, in addition, from recipes found by searching the web by scraping the HTML results page of one public search engine (google.com) and importing up to 5 result pages with the Epic 1 importer. If google.com blocks the scraping (captcha or blocking), the search falls back to the search of https://www.allrecipes.com/.

**In scope**
- Meal suggestions within a calorie limit, a budget limit and a cooking-time limit, alone or combined; a clear message when no meal matches.
- Suggestions from the meal library and, on request, from an online web search.
- An ingredient blacklist: blacklisted ingredients never appear in suggested meals and trigger a warning when planned manually.
- Saved participants (name only) with dietary restrictions chosen from a predefined list.
- Checking each meal against the restrictions of all participants eating it, in suggestions and when planning a meal (Epic 2).
- Cautious behaviour: a meal with unknown ingredient information is flagged rather than silently accepted.
- Instant suggestions from the library for a personal-sized meal collection.

**Out of scope**
- Showing calories, cost and cooking time on a meal (Epic 1 and the Epic 2 plan view).
- Creating, importing or editing meals (Epic 1); weekly planning and shopping list (Epic 2).

**Dependencies:** Epic 1 (meal data, recipe import and its review step), Epic 2 (planning step where the dietary check is applied).

## User Journeys

### Journey 1: Get a suggestion within limits
1. From the day's meal picker in the weekly plan, the user chooses "suggest a meal" and sets one or more limits: calories, budget, cooking time, and ticks the participants eating (which also sets the servings). The limits and ticked participants of the last request are pre-filled and can be cleared.
2. The system shows one matching meal from the library: favourites first, meals already planned that week skipped; meals with unknown ingredient information come after the verified meals and carry a flag.
3. The user accepts the suggestion (and plans it) or asks for "another suggestion", which cycles through all library matches first and then through online matches in the order they were found.
4. If no meal matches, the system says so clearly and names the limits that were applied.

### Journey 2: Search online for more suggestions
1. The user clicks "search online" after seeing the library matches (or none).
2. The system searches google.com by scraping its HTML results page; if google.com shows a captcha or blocks the request, it searches https://www.allrecipes.com/ instead. It imports up to 5 result pages in parallel with the Epic 1 importer, all within one 30-second cap; matching recipes appear one by one as they finish, subject to the same limits, blacklist and dietary checks. Recipes already in the library (same source URL) are skipped.
3. The user picks an online recipe; it goes through the Epic 1 import review step and is saved to the library before being planned.

### Journey 3: Maintain the ingredient blacklist
1. The user opens the blacklist page and adds an ingredient.
2. From now on, meals containing that ingredient never appear in suggestions; planning such a meal manually shows a warning.
3. The user can remove an ingredient from the blacklist again.

### Journey 4: Enter dietary restrictions per participant
1. The user opens the participants page and adds a participant (a saved person, name only) and selects their dietary restrictions from the predefined list.
2. The user can edit or remove participants and their restrictions.

### Journey 5: Check meals against all participants
1. When planning a meal or getting a suggestion, the user ticks who is eating; the servings default to the number ticked and can be changed.
2. The system checks the meal against the restrictions of all ticked participants. The ticked participants are stored with the planned meal.
3. If a participant's restrictions or the blacklist change later, the plan view shows a warning on the affected planned meals.
4. In suggestions, meals that violate a restriction are excluded. When planning manually, a warning names the participant and restriction and the user may still confirm.
5. Meals whose ingredients cannot be assessed are flagged as "could not verify against the restrictions", naming the unknown ingredients.

## Acceptance Criteria

- AC-1: Given meals with known calories, when the user requests a suggestion with a calorie limit, then the suggested meal has at most that many calories per serving.
- AC-2: Given meals with known total cost, when the user requests a suggestion with a budget limit, then the suggested meal's total cost, scaled to the servings being planned (total cost × servings ÷ base servings), is within that limit.
- AC-3: Given meals with known times, when the user requests a suggestion with a cooking-time limit, then the suggested meal's total time (preparation plus cooking) is within that limit.
- AC-4: Given several limits set at once, when the user requests a suggestion, then the suggested meal satisfies all of them.
- AC-5: Given no meal satisfies the limits, when the user requests a suggestion, then a clear message says that no meal matches and names the applied limits.
- AC-6: Given a blacklisted ingredient, then no suggested meal contains it; an ingredient matches the blacklist when its name, ignoring case and surrounding whitespace, equals or contains the blacklisted word (so "nuts" also matches "mixed nuts").
- AC-7: Given a participant, then the participant (name and selected restrictions) is stored and can be edited and removed; no other data is stored about a participant.
- AC-8: Given participants eating a meal, when the meal is checked, then it is checked against the restrictions of all of them, and a violation of any one is detected.
- AC-9: Given a meal with an ingredient whose restriction status cannot be determined, then the meal is not silently accepted: in suggestions it is shown after the verified meals with a "could not verify against the restrictions" flag that names the unknown ingredients.
- AC-10: Given a library of personal size, when the user requests a suggestion, then the library result appears without noticeable delay.
- AC-11: Given a meal that violates a participant's restriction, then it is excluded from suggestions; when the user plans it manually, a warning names the participant and the restriction, and the user may still confirm.
- AC-12: Given a meal missing a value (calories, cost or time) for a limit that is set, then it is excluded from the suggestion for that limit.
- AC-13: Given a manually planned meal that contains a blacklisted ingredient, then a warning is shown and the user may still confirm.
- AC-14: Given a suggestion request, then one meal is shown at a time; "another suggestion" shows the next matching meal; meals already planned in the selected week are skipped; favourites come first.
- AC-15: Given participants ticked for a planned meal, then the servings are pre-filled with the number ticked and can be changed; the dietary check always uses the ticked participants.
- AC-16: Given the library matches, when the user clicks "search online", then google.com is searched by scraping its HTML results page, up to 5 result pages are imported in parallel with the Epic 1 importer, and matching recipes appear one by one as they finish; without that click no online request is made.
- AC-17: Given online results, then they are subject to the same limits, blacklist and dietary checks as library results (these can only be applied after import), and an online search, including all imports, ends within one shared 30-second cap; imports unfinished at that point, and results that fail a check or cannot be parsed, are discarded.
- AC-18: Given an online recipe the user picks, then it goes through the Epic 1 import review step and is saved to the library before it is planned.
- AC-19: Given the search engine is unavailable or finds nothing usable, then the library results remain usable and a clear message says the online search failed or found nothing.
- AC-20: Given the dietary restriction selection, then restrictions can only be chosen from the predefined list: vegetarian, vegan, gluten-free, lactose-free, nut-free, seafood-free.
- AC-21: Given the weekly plan, then "suggest a meal" is available in the meal picker of a day; the blacklist and the participants each have their own page.
- AC-22: Given a meal whose calories or cost are estimated values, then they count when checking limits, and the suggestion shows that the check used an estimate.
- AC-23: Given an online result whose source URL equals the stored source URL of a library meal, then it is skipped.
- AC-24: Given "another suggestion", then it shows all library matches first (favourites first), then online matches in the order they were found.
- AC-25: Given a planned meal, then the ticked participants are stored with it; when a participant's restrictions or the blacklist change afterwards and the meal now violates them, then the plan view shows a warning on that meal, and the meal is not removed.
- AC-26: Given a suggestion request, then the limits and ticked participants of the last request are pre-filled and the user can clear them.
- AC-27: Given the user clicks "search online" and google.com responds with a captcha or blocks the request, then the search automatically falls back to https://www.allrecipes.com/ (its search results page, scraped), and the rest of the flow (import of up to 5 result pages, checks, 30-second cap) is unchanged; the fallback happens within the same 30-second cap and without user action.

## Functional Requirements

- FR-1: The user can request a meal suggestion within a calorie limit (per serving). (AC-1)
- FR-2: The user can request a meal suggestion within a budget limit (total cost per meal scaled to the servings being planned). (AC-2)
- FR-3: The user can request a meal suggestion within a cooking-time limit (preparation plus cooking time). (AC-3)
- FR-4: Limits can be combined. (AC-4)
- FR-5: When no meal matches, the system says so clearly. (AC-5)
- FR-6: The user can maintain an ingredient blacklist; meals containing a blacklisted ingredient never appear in suggestions and trigger a warning when planned manually. (AC-6, AC-13)
- FR-7: The user can enter dietary restrictions per participant, as saved participants (name only) with restrictions from a predefined list. (AC-7, AC-20)
- FR-8: Each meal is checked against the restrictions of all participants eating it, and meals that violate any of them are excluded from suggestions and cause a warning when planned manually in Epic 2. (AC-8, AC-11)
- FR-9: Meals whose ingredients cannot be assessed against a restriction are flagged and shown after the verified meals. (AC-9)
- FR-10: Meals with a missing value for a limit that is set are excluded from the suggestion. (AC-12)
- FR-11: A suggestion request returns one meal at a time with "another suggestion"; planned meals of the week are skipped; favourites come first. (AC-14)
- FR-12: When planning, the user ticks the participants who are eating; servings are pre-filled with the number ticked and can be changed. (AC-15)
- FR-13: Suggestions can include online recipes, found by scraping the google.com HTML results page and importing up to 5 result pages with the Epic 1 importer, only when the user clicks "search online". If google.com blocks the scraping (captcha or blocking), the search falls back to the search of https://www.allrecipes.com/. (AC-16, AC-19, AC-27)
- FR-14: Online results are checked against the same limits, blacklist and dietary restrictions, and are saved to the library through the Epic 1 review step before planning. (AC-17, AC-18)
- FR-15: The suggestion feature is reached from the day's meal picker; the blacklist and the participants have their own pages. (AC-21)
- FR-16: Estimated values count when checking limits, and the result shows when an estimate was used. (AC-22)
- FR-17: Online results already in the library (same source URL) are skipped. (AC-23)
- FR-18: "Another suggestion" cycles through library matches first, then online matches. (AC-24)
- FR-19: Ticked participants are stored with each planned meal and the plan view warns when a later change of restrictions or blacklist makes the meal violate them. (AC-25)
- FR-20: The last request's limits and ticked participants are pre-filled and can be cleared. (AC-26)

## Non-Functional Requirements

- NFR-1: Library suggestions respond fast enough to feel instant for a personal-sized meal collection. (AC-10)
- NFR-2: Dietary checks err on the side of caution: a meal with unknown ingredient information is flagged rather than silently accepted. (AC-9)
- NFR-3: Dietary restrictions are checked deterministically and offline, via a maintained mapping from each predefined restriction to ingredient names/keywords; ingredients matching nothing are flagged as unknown. The mapping is stored as data so it can be extended. (AC-8, AC-9)
- NFR-4: Online search is isolated behind a replaceable adapter for the search source (google.com first, https://www.allrecipes.com/ as fallback when google.com blocks or shows a captcha); it never blocks or breaks library suggestions and ends within 30 seconds. Scraping may be blocked or restricted by the sites' terms; if the fallback fails as well, this maps to the "search failed or found nothing" message. (AC-17, AC-19, AC-27)
- NFR-5: Online search uses no LLM and no extra account or API key.

## Decision Log

### Cycle 1
- Q: Where do meal suggestions come from? → A: From the library, plus recipes found by searching online recipe sources (differs from the recommended option)
- Q: How is a meal checked against a participant's dietary restrictions? → A: A predefined restriction list with a maintained keyword mapping; unmatched ingredients flagged as unknown
- Q: How do participants relate to the servings? → A: Participants are saved people; the user ticks who is eating, servings default to the number ticked and can be changed
- Q: What happens when a planned meal violates a restriction? → A: Suggestions exclude such meals; manual planning shows a warning and the user may still confirm
- Q: How are the three limits interpreted? → A: Calories per serving; budget as total cost scaled to servings; time as preparation plus cooking time
- Q: How are meals with missing values treated when the limit is set? → A: Excluded from the suggestion for that limit
- Q: How is the blacklist matched, and where does it apply? → A: Name match ignoring case/whitespace plus "contains" match; applies to suggestions and warns on manual planning
- Q: What does a suggestion request return? → A: One meal at a time with "another suggestion"; planned meals of the week skipped; favourites first

### Cycle 2
- Q: How are online recipes found? → A: Searching the web with a general search engine and importing the result pages with the Epic 1 importer (differs from the recommended option; replaces the single configured recipe website)
- Q: When are online results fetched? → A: Library matches shown immediately; online search runs only on "search online" and results are added when ready
- Q: What happens to an online recipe the user picks? → A: It goes through the Epic 1 review step and is saved to the library, then planned
- Q: Which dietary restrictions are on the list? → A: Vegetarian, vegan, gluten-free, lactose-free, nut-free, seafood-free (own addition: seafood-free)
- Q: What is stored for a participant besides restrictions? → A: Name only
- Q: Where does the user reach the suggestion feature and the settings? → A: "Suggest a meal" in the day's meal picker; separate pages for blacklist and participants
- Q: How are meals with unknown ingredient information shown? → A: After the verified meals, with a "could not verify" flag naming the unknown ingredients
- Q: Do estimated values count when checking limits? → A: Yes, and the result shows that the check used an estimate

### Cycle 3
- Q: How is the web search performed? → A: Scraping the HTML results page of one public search engine (google.com)
- Change requested by the user after Cycle 3 (no question): if scraping google.com hits a captcha or blocking, fall back to https://www.allrecipes.com/ (AC-27, FR-13, NFR-4)
- Q: How many result pages are imported per online search? → A: Up to 5, in parallel, within one 30-second cap; results appear one by one
- Q: What if an online result is already in the library? → A: Skipped; recognised by stored source URL
- Q: Order of "another suggestion"? → A: All library matches first (favourites first), then online matches in the order found
- Q: Are ticked participants stored with a planned meal? → A: Yes; plan view warns when restrictions or blacklist change later
- Q: Are limits remembered? → A: Last request's limits and ticked participants pre-filled, can be cleared

## Open Questions

None — confidence reached 90%.

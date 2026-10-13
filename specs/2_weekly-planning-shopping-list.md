# PRD: Epic 2 — Weekly Planning & Shopping List

Confidence: 92%

## Overview

Epic 2 lets the user plan one meal per day for a week and turns that plan into a shopping list for the weekly shop. It builds on the meal library from Epic 1 (meals with base servings and ingredients with a number and a unit from the fixed list g, kg, ml, l, tsp, tbsp, piece; ingredient names compared trimmed and case-insensitive). The application is the local web app from Epic 1 (TypeScript/Node.js backend, SQLite storage).

**In scope**
- Planning exactly one meal per day for a calendar week (Monday to Sunday), for the current week and future weeks (a single meal, not separate lunch and dinner).
- Preventing the same meal from being planned twice within one week; allowing repeats across weeks.
- Asking for the number of servings (how many people are eating) for each planned meal.
- Generating the weekly shopping list from the planned meals, scaled to the servings.
- Combining identical ingredients into one entry with a summed quantity.
- Keeping the shopping list in sync when the plan changes (meal added, replaced, removed, servings changed) and when a planned meal is edited or deleted in the meal library.
- A shopping list that is readable and usable while shopping, with tick boxes, source meals per entry, and a print-friendly view with copy-as-text.

**Out of scope (other epics)**
- Adding, editing, importing meals and favourites (Epic 1).
- Meal suggestions within limits, ingredient blacklist and dietary restrictions per participant (Epic 3). Epic 3 later adds a dietary check to the planning step.

**Dependencies:** Epic 1 (meals to plan; ingredient quantities and base servings).

## User Journeys

### Journey 1: Plan a meal for a day
1. The user opens the weekly plan, which shows the current week (Monday to Sunday) and can navigate to the next weeks.
2. The user chooses a day and picks a meal from a searchable list of the meal library, which has a favourites filter and marks meals already planned in that week.
3. The system asks for the number of servings (how many people are eating, a whole number from 1 to 20), pre-filled with the servings of the previously planned meal (initially 4).
4. The meal appears on that day with its servings, calories per serving, total cost scaled to the planned servings and total time (missing values shown as missing). Days without a meal stay empty.

### Journey 2: Avoid repeats within a week
1. The user tries to plan a meal that is already planned on another day of the same week.
2. The system does not allow it and explains that the meal is already planned that week.
3. The user picks another meal. In a different week the same meal can be planned again.

### Journey 3: Change the plan
1. The user replaces the meal of a day, removes it, or changes its servings. Any day of the current week, including past days, can be changed.
2. The plan shows the change, and the shopping list is updated accordingly.

### Journey 4: Generate and use the shopping list
1. The user opens the shopping list of the week.
2. The system shows all ingredients of the planned days, scaled to each meal's servings, with identical ingredients combined into one entry, in one alphabetical list. Each entry shows the days/meals it comes from in a secondary line. A week without planned meals shows an empty state with a link to the plan.
3. The user ticks off entries while shopping. Ticks are kept across sessions. If the plan changes, ticks follow the rules in AC-19.
4. The user can open a print-friendly view or copy the list as text.

### Journey 5: A planned meal is edited or deleted in the library
1. The user edits a meal that is planned: the plan and the shopping list use the new values.
2. The user deletes a meal that is planned: the system asks for confirmation, mentioning that the meal is in a plan; after confirming, the meal is removed from the plan and its day becomes empty.

## Acceptance Criteria

- AC-1: Given the weekly plan, when the user picks a meal for a day and enters the servings, then the meal is shown on that day with its servings.
- AC-2: Given a day that already has a meal, then it can hold exactly one meal; picking another meal replaces it (after the user chooses to replace it).
- AC-3: Given a meal planned on one day of a week, when the user tries to plan the same meal on another day of the same week, then this is refused with a clear message.
- AC-4: Given a meal planned in one week, when the user plans it in a different week, then this is allowed.
- AC-5: Given the user plans a meal, then the number of servings must be entered before the meal is added to the plan.
- AC-6: Given a planned week, when the user opens the shopping list, then each ingredient quantity equals the ingredient's quantity in the meal × the planned servings ÷ the meal's base servings.
- AC-7: Given two or more planned meals that contain the same ingredient (same name after trimming and ignoring case), then the shopping list shows one entry with the summed quantity (see AC-14 for units).
- AC-8: Given a shopping list, when a meal is added, replaced or removed, or its servings are changed, then the shopping list reflects the new plan without manual refresh steps.
- AC-9: Given a saved plan, when the application is closed and reopened, then the plan is still present.
- AC-10: Given a shopping list, then every entry shows ingredient name, quantity and unit in a form that is easy to scan.
- AC-11: Given the plan view, then weeks run from Monday to Sunday; the user can navigate from the current week to any future week, and past weeks cannot be opened.
- AC-12: Given a week in which not every day has a meal, then the empty days are shown as empty, the plan is valid, and the shopping list covers only the planned days.
- AC-13: Given the current week, then all its days, including days already in the past, can be added, replaced, removed and have their servings changed.
- AC-14: Given ingredients with the same name in units of the same family (g with kg, ml with l, tsp with tbsp), then they are converted and shown as one sum in the most readable unit; given units of different families (mass, volume, piece), then they are never combined and stay separate entries.
- AC-15: Given a meal planned for the first time, then the servings field is pre-filled with the servings of the previously planned meal; if none has been planned yet, with 4.
- AC-16: Given the shopping list, then it is one alphabetical list, each entry has a tick box, and ticked state is stored and still shown after closing and reopening the application.
- AC-17: Given a planned meal that is edited in the meal library, then the plan and the shopping list use its updated ingredients and base servings.
- AC-18: Given a planned meal that the user deletes in the meal library, then the confirmation states that it is in a plan; after confirming, it is removed from all plans (leaving the day empty) and from the shopping list; cancelling deletes nothing.
- AC-19: Given a ticked entry, when the plan changes, then the entry stays ticked if its needed quantity is unchanged or lower; if the needed quantity increases it becomes unticked and shows the new total; entries no longer needed disappear.
- AC-20: Given the servings input, then only whole numbers from 1 to 20 are accepted; other values are refused with a message.
- AC-21: Given a scaled quantity, then it is shown with at most one decimal; "piece" quantities are rounded up to the next whole number after summing; units switch at fixed thresholds (1000 g → 1 kg, 1000 ml → 1 l, 3 tsp → 1 tbsp).
- AC-22: Given a shopping list, then a print-friendly view is available and a "copy as text" action copies all entries (name, quantity, unit) as plain text.
- AC-23: Given a planned meal, then the plan view shows name, servings, calories per serving, total cost scaled to the planned servings (total cost × planned servings ÷ base servings) and total time; missing values are shown as missing, not as zero.
- AC-24: Given a shopping list entry, then a secondary line shows the days/meals it is needed for.
- AC-25: Given the meal picker, then meals can be searched by name, filtered to favourites, and meals already planned in the selected week are marked.
- AC-26: Given a week without planned meals, when the user opens its shopping list, then an empty state explains that no meals are planned and links to the plan.

## Functional Requirements

- FR-1: The user can plan exactly one meal per day for a week. (AC-1, AC-2)
- FR-2: A meal cannot be planned twice within the same week; the same meal may be planned in different weeks. (AC-3, AC-4)
- FR-3: The user is asked for the number of servings for every planned meal, pre-filled with the previous planned meal's servings (initially 4). (AC-5, AC-15)
- FR-4: The user can replace the meal of a day, remove it, and change its servings, on any day of the current week and of future weeks. (AC-2, AC-8, AC-13)
- FR-5: The system generates the weekly shopping list from all planned meals, scaling each ingredient quantity by planned servings ÷ base servings. (AC-6)
- FR-6: Identical ingredients across meals are combined into one entry with a summed quantity; units of the same family are converted and shown in the most readable unit, units of different families are not combined. (AC-7, AC-14)
- FR-7: The shopping list is updated whenever the plan changes or a planned meal is edited or deleted in the library. (AC-8, AC-17, AC-18)
- FR-8: The plan, its servings and the ticked state of shopping list entries persist between sessions. (AC-9, AC-16)
- FR-9: Weeks are calendar weeks from Monday to Sunday; the user can navigate to the current and any future week. (AC-11)
- FR-10: Days may stay empty; the shopping list covers planned days only. (AC-12)
- FR-11: The shopping list is one alphabetical list with a tick box per entry. (AC-10, AC-16)
- FR-12: Deleting a planned meal in the library requires a confirmation that mentions the plan, and removes the meal from all plans. (AC-18)
- FR-13: Ticked state follows plan changes: kept if the quantity is unchanged or lower, cleared if it increases, removed with the entry if no longer needed. (AC-19)
- FR-14: Servings are whole numbers from 1 to 20. (AC-20)
- FR-15: Quantities are rounded to at most one decimal, pieces are rounded up, and units switch at fixed thresholds. (AC-21)
- FR-16: The shopping list offers a print-friendly view and a copy-as-text action. (AC-22)
- FR-17: The plan view shows calories per serving, total cost scaled to planned servings and total time for each planned meal. (AC-23)
- FR-18: Each shopping list entry shows the days/meals it comes from. (AC-24)
- FR-19: The meal picker is searchable, has a favourites filter and marks meals already planned that week. (AC-25)
- FR-20: A week without planned meals shows an empty state on the shopping list. (AC-26)

## Non-Functional Requirements

- NFR-1: The shopping list is readable and usable while shopping (clear layout, easy to scan). (AC-10)
- NFR-2: The plan is stored together with the meals in the embedded SQLite database; no data is lost on normal application shutdown. (AC-9)
- NFR-3: Plan changes and the resulting shopping list update appear without noticeable delay for a plan of one week.
- NFR-4: Unit conversion within families uses fixed factors (1 kg = 1000 g, 1 l = 1000 ml, 1 tbsp = 3 tsp); no conversion between different families is attempted. (AC-14, AC-21)
- NFR-5: Copy-as-text and print need no accounts or external integrations. (AC-22)

## Decision Log

### Cycle 1
- Q: How is a "week" defined? → A: Calendar week Monday to Sunday
- Q: Must every day of the week have a meal? → A: No, days can stay empty; the shopping list covers the planned days only
- Q: Which weeks can the user plan? → A: The current week and any future week, navigable with previous/next
- Q: Can days that are already in the past be changed? → A: Yes, the whole current week stays editable
- Q: What is pre-filled as the number of servings? → A: The servings used for the previous planned meal, initially 4
- Q: How are quantities with different units combined? → A: Convert within the same family and show the sum in the most readable unit; never mix mass, volume and pieces
- Q: How is the shopping list organised? → A: One alphabetical list with a tick box per entry, ticks kept across sessions
- Q: What happens when a planned meal is changed or deleted in the library? → A: Deleting asks for confirmation and removes it from the plan; edits flow into the plan and the shopping list

### Cycle 2
- Q: What happens to ticked entries when the plan changes afterwards? → A: Stays ticked if quantity unchanged or lower; unticked with new total if it increases; entries no longer needed disappear
- Q: Which numbers of servings are allowed? → A: Whole numbers from 1 to 20
- Q: How are scaled quantities rounded and displayed? → A: At most one decimal; pieces rounded up; unit switch at fixed thresholds
- Q: Can the shopping list be printed or shared? → A: Print-friendly view and "copy as text" button
- Q: What does the plan view show for each planned meal? → A: Name, servings, calories per serving, total cost scaled to servings, total time; missing shown as missing
- Q: Does the shopping list show which meals an entry is needed for? → A: Yes, in a secondary line
- Q: How does the user find a meal when picking one? → A: Searchable list with favourites filter and indicator for meals already planned this week
- Q: What does the shopping list show for a week without planned meals? → A: Empty state with a link to the plan

## Open Questions

None — confidence reached 90%.

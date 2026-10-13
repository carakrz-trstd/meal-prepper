Weekly Meal Planner & Shopping List
 
Our briefing (optimized by Claude):
 
 
----
 
# Briefing: Weekly Meal Planner & Shopping List
 
Chosen greenfield project for the AE workshop (2026-10-13).
 
## Goal
 
Plan meals for the week and generate a shopping list for the weekly shop.
 
## Core features
 
1. **Meal planning**
   - Plan exactly one meal per day (a single meal, not separate lunch and dinner).
   - A meal is not repeated within the current week. Repeats across weeks are allowed.
   - Ask for the number of servings per meal (how many people are eating).
2. **Meal management**
   - Add meals and mark them as favourites.
3. **Shopping list**
   - Generate the weekly shopping list from the planned meals, scaled to the servings.
4. **Recipe import**
   - Parse a recipe from an online source.
 
## Constraints and filters
 
Each constraint can be shown on a meal, and also used to generate a meal suggestion within a limit.
 
| Constraint | Shown | Used to generate a meal |
|---|---|---|
| Calories | Calories per meal | Within a calorie limit |
| Budget | Total cost per meal | Within a budget limit |
| Cooking time | Time to cook the meal | Within a time limit |

 
- **Ingredient blacklist:** excluded ingredients never appear in suggested meals.
- **Dietary restrictions:** entered per participant. Each meal is checked against the restrictions of all participants eating it.
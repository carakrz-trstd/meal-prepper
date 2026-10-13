---
name: brainstorm
description: Create or refine the PRD of one roadmap epic through question-and-answer cycles written into the PRD itself. Use when the user wants to brainstorm, detail, or continue an epic, e.g. "/brainstorm 1" or "/brainstorm Meal Library & Recipe Import".
argument-hint: <epic number or name>
disable-model-invocation: true
---

# Brainstorm an epic into a PRD

Input: `$ARGUMENTS` — an epic number or name from `specs/roadmap.md`.

Output: the PRD at `specs/<n>_<epic-slug>.md`, where `<n>` is the epic number and `<epic-slug>` is the kebab-case epic title (e.g. `specs/1_meal-library-recipe-import.md`). Slug rules: lowercase, `&` and other punctuation dropped, words joined with `-`.

## Hard rules

- **Never ask questions in the chat.** All open questions go at the end of the PRD under `## Open Questions`.
- **Never check an option yourself.** Only the user checks boxes.
- Do not make decisions the user has not made. Unanswered topics stay as questions.

## Steps

### 1. Resolve the epic
Read `specs/roadmap.md`. Match `$ARGUMENTS` to a heading `## Epic <n> — <title>` by number or (case-insensitive) title. If there is no match, or no argument, reply in the chat with the list of available epics and stop (this is the only chat exception: no PRD can be touched without an epic).

### 2. Load context
Read `specs/briefing.md`, `specs/roadmap.md`, and the PRD if it already exists. Also read the PRDs of epics this epic depends on, so decisions stay consistent.

### 3. Create the PRD if it does not exist
Base it on the briefing and the roadmap entry. Use this structure:

```markdown
# PRD: Epic <n> — <title>

Confidence: <x>%

## Overview
<goal and scope of the epic, what is explicitly out of scope, dependencies on other epics>

## User Journeys
### Journey 1: <name>
<numbered steps from the user's point of view>

## Acceptance Criteria
- AC-1: <testable statement, Given/When/Then or equivalent>

## Functional Requirements
- FR-1: ...

## Non-Functional Requirements
- NFR-1: ...

## Decision Log

## Open Questions
```

Every functional requirement from the roadmap entry must be traceable to at least one AC. Do not make tech or architecture decisions on your own; they enter the PRD only after the user answers a question about them.

### 4. Reconcile answered questions (every run, before anything else)
For each question under `## Open Questions` that has a checked option (`- [x]`):
1. Integrate the answer into the PRD body: update or add user journeys, ACs, functional requirements and non-functional requirements so the PRD states the decision directly (not as "per question 3").
2. Remove the question from `## Open Questions`.
3. Add a short entry to `## Decision Log` under a heading for the current cycle (`### Cycle <k>`), one line each: `Q: <question> → A: <chosen option>`. Cycle numbers increase by one per run that reconciles answers.

If a question has several or no checked options, leave it open and note in a sub-line that it needs exactly one answer. If an answer contradicts an existing requirement, update the requirement and mention the change in the log line.

### 5. Add new open questions
Re-analyse the PRD for gaps, ambiguities, and unstated decisions (edge cases, data details, error handling, limits, UX behaviour, NFRs). Add questions only where an answer would change the PRD. Put them under `## Open Questions`, which must be the last section of the document. Final section order: ... `## Decision Log`, then `## Open Questions`. (When creating the PRD in step 3, use this order too.)

Question format — each question has 3–4 options tailored to this project, written as checkboxes, with exactly one marked `(Recommended)` plus a one-line reason:

```markdown
### Q<k>: <question>
- [ ] <option A> (Recommended) — <one-line reason>
- [ ] <option B>
- [ ] <option C>
```

Rules:
- Number questions continuously across cycles (never reuse a number).
- Exactly one `(Recommended)` per question; all boxes unchecked.
- Options must be concrete to the meal planner (e.g. units, servings, day boundaries, recipe sources), not generic.
- For **architecture or high-impact tech questions** (stack, persistence, data model, parsing approach, hosting, integrations): first consult the `architecture-advisor` agent via the Agent tool, passing the question, the options, and the epic. Use its recommendation as the `(Recommended)` option and state in the reason that the architecture advisor chose it and why. Batch all such questions into one call.
- Ask at most ~8 questions per cycle, highest-impact first.

### 6. Update confidence
Assess the PRD honestly: how completely do the journeys, ACs, and requirements cover the epic, and how many ambiguities or open decisions remain? Write `Confidence: <x>%` directly below the title, and update it every cycle.

- Below 90%: keep adding questions (step 5).
- At 90% or above: stop asking. `## Open Questions` stays as the last section with a single line: `None — confidence reached 90%.` (if no unanswered questions remain). Unanswered questions that are still open stay listed.

### 7. Report
In the chat, report briefly: PRD path, new confidence, how many answers were reconciled, how many new questions were added, and tell the user to check their answers in the PRD and run `/brainstorm <epic>` again. Do not repeat the questions in the chat.

---
name: write-spec
description: Turn the PRD of one roadmap epic into a detailed technical specification (architecture decisions, TDD implementation tasks, AC traceability, Playwright e2e test) through question-and-answer cycles written into the spec itself. Use after the brainstorm skill, e.g. "/write-spec 1" or "/write-spec Meal Library & Recipe Import".
argument-hint: <epic number or name>
---

# Write the technical spec of an epic

Input: `$ARGUMENTS` — an epic number or name from `specs/roadmap.md`.

Required: the PRD at `specs/<n>_<epic-slug>.md`.

Output: the spec at `specs/<n>_<epic-slug>-spec.md` (same `<n>` and `<epic-slug>` as the PRD). Slug rules: lowercase, `&` and other punctuation dropped, words joined with `-`.

## Hard rules

- **Never ask questions in the chat.** All open questions go at the end of the spec under `## Open Questions`.
- **Never check an option yourself.** Only the user checks boxes.
- Do not make a high-impact technical decision the user has not made (and that no PRD or guideline already fixes). Such topics stay as questions.
- Never change the PRD. If the spec reveals a gap in the PRD, put it in the spec's open questions.
- Do not create the Playwright test or any project code. This skill only writes the spec; the implement-epic skill builds and sets up the e2e test later.

## Steps

### 1. Resolve the epic and the PRD
Read `specs/roadmap.md`. Match `$ARGUMENTS` to a heading `## Epic <n> — <title>` by number or (case-insensitive) title. Derive `<epic-slug>` from the title.

Then look for the PRD: first an existing file `specs/<n>_*.md` that is not a `-spec.md` file, otherwise `specs/<n>_<epic-slug>.md`. If there is no match for the epic, or **no PRD exists**, reply in the chat that the PRD is missing and that the user must run the `brainstorm` skill for this epic first (`/brainstorm <epic>`), and stop. **Do not create or change any file.** (This is the only chat exception, together with the final report.)

If the PRD is below its stated confidence of 90% or still has open questions, continue anyway but record the gap in the spec's open questions.

### 2. Load context
Read `specs/briefing.md`, `specs/roadmap.md`, the PRD, and the spec if it already exists. Also read `.claude/_architecture-guidelines.md` if it exists (authoritative), the PRDs and specs of epics this epic depends on, and any existing code that this epic extends, so naming, structure and decisions stay consistent.

### 3. Create the spec if it does not exist
Use this structure (section names are fixed):

```markdown
# Spec: Epic <n> — <title>

Confidence: <x>%

PRD: [<prd file name>](<prd file name>)

## Overview
<scope, what the spec covers, dependencies on other epics' specs>

## Key Architecture Decisions
| # | Decision | Choice | Rationale | Source |
|---|----------|--------|-----------|--------|
| AD-1 | ... | ... | ... | PRD NFR-4 / Q&A cycle k / architecture advisor |

## Technical Design
### Data model
### Modules and components
### Interfaces (API / adapters)
### Key flows
<one subsection per user journey of the PRD, as sequence or step list>

## Implementation Tasks
### T-1: <title>
- **Satisfies:** AC-1, AC-4 (and the FR/NFR numbers)
- **Depends on:** T-… / none
- **Tests first (TDD):**
  - <test file>: <test case names / given-when-then — written and failing before the implementation>
- **Implementation:** <files/modules to create or change, behaviour, edge cases>
- **Done when:** <observable result>

## Traceability
| AC | Tasks | Tests |
|----|-------|-------|
| AC-1 | T-1, T-3 | <test names> |

(Then a second table for FR and NFR coverage.)

## E2E Test (Playwright)
<see step 3d>

## Decision Log

## Open Questions
```

Fill it in as follows:

**a. Key architecture decisions.** List every architecture or high-impact tech decision the epic needs. Decisions already fixed by the PRD (stack, storage, import approach, scraping sources, limits, etc.) or by `.claude/_architecture-guidelines.md` are entered as given, with their source. Decisions that are still open (test runner, schema migration approach, frontend framework, error-handling approach, project structure, etc.) are **not** decided by you: list them as "Open — see Q<k>" and ask them in step 5.

**b. Technical design.** Concrete enough that a developer can implement without further questions: tables/columns and types, modules and their responsibilities, function/endpoint signatures, adapter interfaces for external sources, and one flow per PRD user journey including error paths from the PRD.

**c. Implementation tasks.** Ordered, small, each independently testable and dependency-aware (so independent tasks can run in parallel). **Assume TDD:** every task lists the tests to write first (file, test names, what each asserts), then the implementation. Every task names the ACs (and FRs/NFRs) it satisfies.

**d. E2E test (Playwright).** Describe, do not write, one Playwright test file for the epic: the user journeys covered (one test per PRD journey, incl. the failure journeys), preconditions and fixtures/test data (e.g. seeded database, stubbed external websites so no real scraping happens), step-by-step actions with the selectors or accessible roles to use, assertions per step, which ACs each test verifies, how to start the app for the test, and what must be stubbed. State that the implement-epic skill builds and sets this test up later.

**e. Traceability.** Every AC of the PRD maps to at least one task and at least one test; every FR and NFR is covered by a task. If something cannot be covered, say why and add an open question. Before finishing, check this mechanically: list the PRD's AC numbers and confirm each appears in the table.

### 4. Reconcile answered questions (every run, before anything else)
For each question under `## Open Questions` that has a checked option (`- [x]`):
1. Integrate the answer into the spec body: update the key architecture decisions, technical design, implementation tasks (including their tests), traceability and e2e test so the spec states the decision directly (not as "per question 3").
2. Remove the question from `## Open Questions`.
3. Add a short entry to `## Decision Log` under a heading for the current cycle (`### Cycle <k>`), one line each: `Q: <question> → A: <chosen option>`. Cycle numbers increase by one per run that reconciles answers.

If a question has several or no checked options, leave it open and note in a sub-line that it needs exactly one answer. If an answer contradicts something already in the spec, update it and mention the change in the log line. If an answer chosen as free text (not one of the options) is given, integrate it as written.

### 5. Add new open questions
Re-analyse the spec for gaps, ambiguities and unstated technical decisions (libraries, project structure, schema details, error handling, test strategy, stubbing, configuration, performance, security of scraping, etc.). Add questions only where an answer would change the spec. Put them under `## Open Questions`, which must be the last section of the document. Final section order: ... `E2E Test (Playwright)`, `Decision Log`, then `Open Questions`.

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
- Options must be concrete to the meal planner and its stack, not generic.
- For **architecture or high-impact tech questions** (frameworks, libraries, persistence access, data model, test tooling, integrations, project structure): first consult the `architecture-advisor` agent via the Agent tool, passing the question, the options, and the epic (it reads the PRD, spec and guidelines itself). Use its recommendation as the `(Recommended)` option and state in the reason that the architecture advisor chose it and why. Batch all such questions into one call.
- Ask at most ~8 questions per cycle, highest-impact first.

### 6. Update confidence
Assess the spec honestly: does it cover all ACs, FRs and NFRs with tasks and tests, are the architecture decisions settled, is the design concrete, is the e2e test fully described, and how many open decisions remain? Write `Confidence: <x>%` directly below the title, and update it every cycle.

- Below 90%: keep adding questions (step 5).
- At 90% or above: stop asking. `## Open Questions` stays as the last section with a single line: `None — confidence reached 90%.` (if no unanswered questions remain). Unanswered questions that are still open stay listed.

### 7. Report
In the chat, report briefly: spec path, new confidence, how many answers were reconciled, how many new questions were added, and tell the user to check their answers in the spec and run `/write-spec <epic>` again. Do not repeat the questions in the chat.

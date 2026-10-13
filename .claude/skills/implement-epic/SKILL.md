---
name: implement-epic
description: Implement one roadmap epic test-first from its technical spec and PRD, including the Playwright e2e test, until all tests pass, then report the status of every acceptance criterion. Use only when the user asks to implement an epic, e.g. "/implement-epic 1" or "/implement-epic Meal Library & Recipe Import".
argument-hint: <epic number or name>
---

# Implement an epic

Input: `$ARGUMENTS` — an epic number or name from `specs/roadmap.md`.

Inputs on disk: the spec `specs/<n>_<epic-slug>-spec.md` and the PRD `specs/<n>_<epic-slug>.md` (same `<n>` and `<epic-slug>`; slug = kebab-case epic title: lowercase, `&` and other punctuation dropped, words joined with `-`), and `.claude/_architecture-guidelines.md` if it exists (authoritative).

Goal: implement the epic until every requirement and AC of the spec and the PRD is implemented and confirmed by passing tests, then report the status of every AC as done / partly / not done.

## Hard rules

- The spec and the PRD are the source of truth. Do not change them. If you find an error or gap, report it at the end; do not silently deviate. Do not make a high-impact technical decision the spec leaves open; stop and report instead (see step 1).
- Test first (TDD): write the tests of a task before its implementation and run them once to see them fail for the right reason.
- Never weaken, skip, delete or special-case a test to make it pass. A test may only be changed when it contradicts the spec or PRD; say so in the final report.
- No test may contact a real external website (Google, allrecipes.com, rewe.de, Open Food Facts, recipe sites, ...). Use the stubs the spec describes (local stub server, fixtures, injectable base URLs).
- Do not commit, push or install anything globally. Install only project dependencies and the Playwright browser the e2e test needs.
- Do not ask questions in the chat during the run. Blockers go into the final report (or stop the run, see step 1).
- Report faithfully: if a test fails or an AC is not done, say so with the evidence. Do not claim "done" for anything not confirmed by a passing test.

## Steps

### 1. Resolve and check preconditions
Read `specs/roadmap.md` and match `$ARGUMENTS` to a heading `## Epic <n> — <title>` by number or (case-insensitive) title. If there is no match, list the available epics in the chat and stop.

Then check, and stop with a short chat message (creating and changing nothing) when:
- the PRD or the spec is missing: tell the user to run `/brainstorm <epic>` and then `/write-spec <epic>` first;
- the spec's `## Open Questions` still lists questions or its `Confidence:` is below 90%: tell the user to answer them and run `/write-spec <epic>` again;
- an epic this epic depends on (see the spec's Overview) has not been implemented yet, i.e. its modules, tables or routes named in the spec do not exist in the code and its tasks are not done: tell the user to run `/implement-epic <that epic>` first.

### 2. Analyze
Read the spec completely (architecture decisions, technical design, tasks, traceability, E2E section), the PRD (user journeys, ACs, FRs, NFRs), the guidelines file if present, the specs of the epics this one depends on, and the existing code and tests. Work out which tasks are already done (code and passing tests exist) so that a re-run continues instead of starting over.

Make a task list from the spec's Implementation Tasks (T-1, T-2, ...) with their dependencies; independent tasks may be worked on in parallel (for example with sub agents, each given one task, its tests and its files), but integrate and run the whole suite yourself. Keep the list updated as you go.

### 3. Set up the project and Playwright
- If the project scaffold the spec expects does not exist (package.json, TypeScript config, folder structure, test runner), create it exactly as the spec's first task describes. Use the versions and tools named in the spec's Key Architecture Decisions.
- Set up Playwright if it is not set up yet: add `@playwright/test` as a dev dependency, create `playwright.config.ts` (test directory `e2e/`, `webServer` that starts the app as described in the spec's E2E section, base URL, headless, one project with Chromium), add the npm scripts the spec names (e.g. `test:e2e`, `start:e2e`), install the browser with `npx playwright install chromium`, and add `e2e/` helpers the spec calls for (stub server, global setup, fixtures, control endpoint). If Playwright is already set up (by an earlier epic), reuse and extend it; do not duplicate config.
- Add the e2e stub server and fixtures first; they are part of the test code.

### 4. Build the tests (red)
For each task in dependency order, write the tests listed under "Tests first (TDD)" at the paths and with the case names the spec gives (unit, integration, component tests). Then write the Playwright e2e test file described in the spec's E2E section into `e2e/`: one test per journey including the failure journeys, with the described fixtures, selectors/accessible roles, steps and assertions, and the ACs named in each test title. Run the new tests once and confirm they fail because the feature is missing, not because of a typo or setup error; fix setup errors.

### 5. Implement
Implement the tasks in dependency order exactly as the spec's design says (data model, modules, interfaces, flows, edge cases). Keep the code consistent with the surrounding code and the spec's names and paths. The UI must expose the accessible roles, labels and texts the e2e section relies on. After each task run the tests of that task, and fix until they pass before moving on.

### 6. Run and fix
1. Run the unit/integration/component tests for everything you changed, then the full unit test suite to catch regressions in other epics.
2. Run the type checker and the linter if the project has them.
3. Run the Playwright e2e test(s) of this epic (and the existing e2e tests of earlier epics, if any).
4. For every failure: find the cause, fix the implementation (not the test, unless the test contradicts the spec or PRD), and re-run. Repeat until everything passes.
5. If the same failure survives several different fix attempts, or a fix would require breaking the spec, a decision the spec leaves open, or a change to another epic's contract, stop trying, and report it as a blocker with the evidence (test name, error, what was tried). Do not mark the affected ACs as done.

### 7. Finish and report
When all tests pass (or only reported blockers remain), do a last full run of tests, type check, lint and e2e, and confirm every task from the spec is implemented. Then report in the chat:

1. **Result:** which commands were run and their outcome (counts of passing/failing tests per suite, e2e result).
2. **AC status table:** one row for every AC of the PRD (all of them, from the first to the last number): `AC-n | done / partly / not done | evidence (test names or files) | note`. `done` = implemented and covered by a passing test; `partly` = implemented but a part is untested, stubbed or deviates (say which); `not done` = missing or blocked (say why).
3. **FR/NFR gaps:** list any FR or NFR that is not fully covered.
4. **Deviations and findings:** tests changed because they contradicted the spec/PRD, spec/PRD errors found, assumptions made, dependencies on other epics, files created.
5. **Next step:** what the user should do next (e.g. fix blockers, implement the next epic).

Do not commit. Leave the working tree for the user to review.

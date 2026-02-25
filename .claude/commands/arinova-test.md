---
name: "Arinova Test"
description: Run the full test suite and report results
category: Testing
tags: [testing, vitest, playwright, e2e]
---

Run the Arinova Chat test suite.

**Input**: Optionally specify a scope after `/arinova-test`:
- (no argument) — Run all Vitest tests (server + web)
- `server` — Run server tests only
- `web` — Run frontend tests only
- `e2e` — Run Playwright E2E tests only
- `all` — Run both Vitest and Playwright tests

**Steps**

1. **Determine scope** from the argument (default: all Vitest tests).

2. **Run the appropriate test command(s)**:

   | Scope | Command |
   |-------|---------|
   | (default) | `pnpm test` |
   | `server` | `pnpm --filter server test` |
   | `web` | `pnpm --filter web test` |
   | `e2e` | `pnpm test:e2e` |
   | `all` | `pnpm test` then `pnpm test:e2e` |

3. **Parse and display results**

   After each test run, present a clear summary:

   ```
   ## Test Results

   | Suite | Files | Tests | Passed | Failed | Duration |
   |-------|-------|-------|--------|--------|----------|
   | Server | X | Y | Y | 0 | Xs |
   | Web | X | Y | Y | 0 | Xs |
   | **Total** | **X** | **Y** | **Y** | **0** | **Xs** |
   ```

4. **If any tests fail**:
   - List each failing test with file path, test name, and error message
   - Show the assertion diff if available
   - Suggest a fix if the cause is obvious
   - Ask the user if they want you to fix the failing tests

5. **If all tests pass**:
   - Show the summary table
   - Report total test count and duration

**Test Architecture Reference**

- **Server**: Rust (`apps/rust-server/`) — tested separately via `cargo test`

- **Frontend tests** (`apps/web/`): Vitest, jsdom environment, React Testing Library
  - Unit: `src/lib/`, `src/store/`
  - Components: `src/components/chat/`, `src/app/login/`, `src/app/register/`
  - Setup: `src/test-setup.ts` (jest-dom matchers + localStorage polyfill)

- **E2E tests** (`e2e/`): Playwright, Chromium
  - Specs: `e2e/tests/`
  - Helpers: `e2e/helpers/`
  - Config: `e2e/playwright.config.ts` (ports 3500/3501)

**Guardrails**
- Always show the full test output so the user can see details
- If a test command fails to start (missing deps, config error), diagnose and suggest a fix
- For E2E tests, warn if dev servers are not running on ports 3500/3501
- Never modify test files or source code unless the user explicitly asks you to fix failures

# Wayfarer — notes for coding agents

## Every change is recorded and documented — no exceptions

Each commit that changes code, data or config must, **in the same commit**:

1. **CHANGELOG.md** — add a line under `## Unreleased` (Added / Changed / Fixed / Removed / Data / Docs). CI fails pull requests without it (`scripts/check-docs.mjs`).
2. **README.md** — update the functional reference when behaviour changes: new or changed screen, button, flow or message → _Features_ and _Screens and routes_; Edge Function, RPC, view or table → _Backend reference_; constant, validation or limit → _Limits and rules_; new limitation → _Known limitations_; setup, scripts or env → the development sections. Checklist: README → "Maintaining this README".
3. **Cities** — adding, removing, deactivating or re-ingesting a city:
   - run the pipeline (`ingest --city <slug>` or `seed`), which regenerates `docs/CITIES.md` — never edit that file by hand; `python -m wayfarer_pipeline cities-doc --check` must pass;
   - name the city under **Data** in CHANGELOG.md, with the new totals;
   - update city/attraction counts quoted in README.md and PROGRESS.md.
4. **Decisions** — non-trivial choices (new provider, library, trade-off) → `docs/DECISIONS.md` as the next `D-0xx`; data sources/licences → `docs/DATA_SOURCES.md`.
5. **Status** — milestone progress or remaining work → `PROGRESS.md`.

Before committing, run `node scripts/check-docs.mjs` (compares against `origin/dev`, including uncommitted files).

## Branches (D-075)

Branch from `dev` and open pull requests into **`dev`**, never `main`. `main` is production: it only moves when a green commit of `dev` is approved in the Promote workflow, which then deploys it.

## Code style

- Functions: 4-20 lines. Split if longer.
- Files: under 500 lines. Split by responsibility.
- One thing per function, one responsibility per module (SRP).
- Names: specific and unique. Avoid `data`, `handler`, `Manager`.
  Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no `Dict`, no untyped functions.
- No code duplication. Extract shared logic into a function/module.
- Early returns over nested ifs. Max 2 levels of indentation.
- Exception messages must include the offending value and expected shape.

## Comments

- Keep your own comments. Don't strip them on refactor — they carry
  intent and provenance.
- Write WHY, not WHAT. Skip `// increment counter` above `i++`.
- Docstrings on public functions: intent + one usage example.
- Reference issue numbers / commit SHAs when a line exists because
  of a specific bug or upstream constraint.

## Tests

- Tests run with a single command: `pnpm check` (app + shared); `cd data-pipeline && pytest` (pipeline); `cd supabase/functions && deno test --allow-net=jsr.io` (Edge Functions).
- **TDD: red → green → refactor.** Write the test first and run it to see it fail for the
  expected reason (red); then write the minimum code that makes it pass (green); then refactor
  with the tests green. Bug fixes start with a regression test that reproduces the bug.
- Every new function gets a test. Bug fixes get a regression test.
- Mock external I/O (API, DB, filesystem) with named fake classes,
  not inline stubs.
- Tests must be F.I.R.S.T: fast, independent, repeatable,
  self-validating, timely.

## Dependencies

- Inject dependencies through constructor/parameter, not global/import.
- Wrap third-party libs behind a thin interface owned by this project.

## Structure

- Follow the framework's convention (Rails, Django, Next.js, etc.).
- Prefer small focused modules over god files.
- Predictable paths: controller/model/view, src/lib/test, etc.

## Formatting

- Use the project's formatters; don't discuss style beyond that:
  - TypeScript/JSON/Markdown (`apps/`, `packages/`, root): `prettier` — `pnpm format` (CI: `pnpm format:check`).
  - Python (`data-pipeline/`): `ruff format` (+ `ruff check`) — not `black`.
  - Edge Functions (`supabase/functions/`, Deno): `deno fmt` — prettier ignores this folder.
  - Generated files (`*.sql` seeds, `docs/CITIES.md`, `database.types.ts`) are not formatted by hand; regenerate them.

## Logging

- Structured JSON when logging for debugging / observability.
- Plain text only for user-facing CLI output.

## Other notes

- Expo-specific notes: `apps/mobile/AGENTS.md`.
- After editing `packages/shared`, run `pnpm sync:shared` (D-005).

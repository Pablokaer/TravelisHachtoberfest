# Travelist (Wayfarer) — instructions for GitHub Copilot

Expo / React Native app (`apps/mobile`), shared TypeScript (`packages/shared`), Supabase backend
(`supabase`), Python data pipeline and local city-builder service (`data-pipeline`).
The full house rules are in [CLAUDE.md](../CLAUDE.md); the ones that matter most:

- Branch from `dev` and open pull requests into `dev`, never `main`.
- Every commit that changes code, data or config also updates `CHANGELOG.md` (under
  `## Unreleased`) and, when behaviour changes, `README.md`. CI runs `scripts/check-docs.mjs`.
- Test first (red → green → refactor); bug fixes start with a regression test.
  `pnpm check` (app + shared), `cd data-pipeline && pytest`, `node --test scripts/*.test.mjs`.
- Functions 4–20 lines, files under 500 lines, explicit types (no `any`), early returns,
  exception messages that name the offending value and the expected shape.
- Format: `pnpm format` (TypeScript/Markdown/JSON), `ruff format` + `ruff check` (Python).
- Dependencies are injected; third-party libraries sit behind a small interface of ours, and
  tests use named fake classes, not inline stubs.
- Never edit generated files by hand (`docs/CITIES.md`, `*.sql` seeds, `database.types.ts`).
- Open-source AI is local by default (Ollama); partner services (Sentry, SerpApi, ElevenLabs,
  MongoDB Atlas) are optional and off until their key is set.

# AGENTS.md

## Done means `pnpm check` is green

`pnpm check` runs the format check, typecheck, lint and tests; the pre-commit hook and CI run it too. When it goes red, fix the code until it passes. The lint and compiler settings are fixed, and only a human changes them or adds a suppression.

## Libraries newer than your training

Effect is v4 and XState is v6. Both differ from the v3 and v5 APIs you may remember. Before writing code with either, read the docs bundled with the installed version:

- Effect: `node_modules/effect/AGENTS.md`
- XState: `node_modules/xstate/docs/agents.md`

## Code shape

The checks list every violation; these are the moves that satisfy them:

- **Effect for every effect.** Write async flow with `Effect.gen` / `Effect.fn`, wrap promises with `Effect.tryPromise`, log with `Effect.log`, read settings with `Config`.
- **Tagged errors.** Fail with `Schema.TaggedErrorClass` or `Data.TaggedError` so each failure has its own type.
- **Narrow, don't assert.** Get to a precise type with type guards or `Schema` decoding.
- **Split on size limits.** When a file, function or parameter list hits a limit, extract a smaller unit with a clear name.
- **Named exports**, kebab-case file names, relative imports ending in `.ts`.
- **Tests** sit next to the code as `*.test.ts`, use `it.effect` from `@effect/vitest`, and run one straight path per test.

## Comments carry why; code carries what

The default is no comment. A comment that describes what the code does goes stale at the next edit.

- **Say what in code:** a better name, a smaller function, a type, a `Schema`, a test.
- **Write a comment only for why,** as "X because Y": a constraint the code can't show (an upstream limit, a spec), a rejected alternative, a non-obvious invariant.
- **Link the source** (issue `#123`, an ADR in `docs/adr/`, an upstream URL) instead of copying it. A decision spanning files gets an ADR.
- **JSDoc on exported API only,** stating the contract callers can rely on.
- **Re-read the comments around every hunk you edit,** then update or delete each one so it matches the new code.
- **Unfinished work goes in an issue,** never in a TODO comment.

## Agent skills

### Issue tracker

GitHub Issues on `tonytangdev/rouage`, via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.

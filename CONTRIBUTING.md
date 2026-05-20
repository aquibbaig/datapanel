# Contributing

## Engineering Principles

- Keep responsibilities explicit. UI code does not contain database logic, and database packages do not know about React.
- Prefer small interfaces at package boundaries: keychain, settings storage, database adapter, and query executor.
- Pass `context.Context` through database and long-running Go operations.
- Keep secrets out of logs, errors, JSON files, screenshots, and tests.
- Prefer typed DTOs over unstructured maps at the Wails boundary.

## Go Guidelines

- Run `gofmt` before committing.
- Keep SQL metadata queries centralized in `internal/postgres`.
- Return user-safe errors from services; wrap low-level errors only when the message is safe to show.
- Add unit tests for validation, destructive-query detection, and persistence behavior.
- Use integration tests for real Postgres behavior.

## Frontend Guidelines

- Use strict TypeScript.
- Keep server state, UI state, and editor state separate.
- Keep side effects in feature hooks or service modules; keep display components as presentational as practical.
- Use virtualization-friendly rendering for long schema lists and query results.
- Keep the UI dense, calm, and fast: compact controls, subtle borders, visible focus states, and minimal motion.

## Git Hygiene

- Make focused commits.
- Do not commit local credentials, generated build binaries, logs, or app config data.
- Include tests or a clear manual verification note for behavioral changes.


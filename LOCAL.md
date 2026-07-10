# Local Development

## Stack

- Desktop shell: Wails v2
- Backend: Go
- Frontend: React, TypeScript, Vite
- Database drivers: pgx for Postgres, go-sql-driver/mysql for MySQL
- Secret storage: encrypted local vault unlocked by a single OS keychain item through `99designs/keyring`

## Setup

Install dependencies:

```bash
go mod download
npm install --prefix frontend
```

Run frontend checks:

```bash
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

Run backend tests:

```bash
go test ./internal/...
```

Run the desktop app:

```bash
wails dev
```

Build a production app:

```bash
wails build
```

Build a macOS `.app` bundle:

```bash
./scripts/build-mac-app.sh
```

The app bundle is written to `build/bin/DataPanel.app`.

## Release Builds

macOS, Windows, and Linux builds are attached to GitHub Releases when a version tag is pushed:

- macOS: DMG installer window and zipped `.app` bundle.
- Windows: portable `.zip` and NSIS installer for `windows/amd64` and `windows/arm64`.
- Linux WebKit 4.0: `.deb` for Debian 12/Ubuntu 22.04 compatible systems, named `datapanel_*_linux_amd64_debian12_ubuntu22.04_webkit2_40.deb`.
- Linux WebKit 4.1: `.deb` for Debian 13/Ubuntu 24.04 compatible systems, named `datapanel_*_linux_amd64_debian13_ubuntu24.04_webkit2_41.deb`.
- Linux AppImage: portable build for systems where the matching WebKit `.deb` dependency is not available.

Create a GitHub Release with a tag such as `v0.1.0`, or run the release workflows manually with an existing release tag.

## Project Layout

- `internal/app`: Wails lifecycle and app paths.
- `internal/connections`: connection profiles, validation, and credential storage.
- `internal/postgres`: Postgres pooling, metadata, and query execution.
- `internal/mysql`: MySQL connection and query adapter.
- `internal/bigquery`: BigQuery adapter.
- `internal/query`: SQL orchestration, cancellation, history, and destructive-query analysis.
- `internal/settings`: persisted user settings.
- `internal/updater`: release checks, downloads, and platform installers.
- `frontend/src/app`: app shell, layout, and top-level state.
- `frontend/src/features`: feature-local UI and behavior.
- `frontend/src/lib`: typed Wails service boundary.

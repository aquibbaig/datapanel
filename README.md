# DataPanel

DataPanel is a modern AI assisted database client. The MVP is a Wails app with a Go backend, React + TypeScript frontend, and Postgres support.

## Goals

- Save Postgres connection profiles without storing secrets in plain text.
- Test and open database connections.
- Browse schemas, tables, columns, indexes, and constraints.
- Execute SQL with query limits, cancellation, status feedback, and destructive-query warnings.
- Keep schema metadata structured so future AI features can understand database context.

## Stack

- Desktop shell: Wails v2
- Backend: Go
- Frontend: React, TypeScript, Vite
- Database driver: pgx
- Secret storage: OS keychain through `99designs/keyring`

## Local Development

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

## Install on macOS

Download `DataPanel-macOS.dmg` from the latest GitHub Release, open it, then drag DataPanel into Applications.

Install the latest macOS build with Homebrew:

```bash
curl -fsSL https://raw.githubusercontent.com/aquibbaig/datapanel/main/scripts/install-macos.sh | sh
```

Technical users can also install and clear quarantine automatically:

```bash
curl -fsSL https://raw.githubusercontent.com/aquibbaig/datapanel/main/scripts/install-macos.sh | sh -s -- --no-quarantine
```

The current macOS build is unsigned. If macOS blocks the first launch, open System Settings > Privacy & Security and choose Open Anyway for DataPanel.

## Release Builds

macOS, Windows, and Linux builds are attached to GitHub Releases when a version tag is pushed:

- macOS: DMG installer window and zipped `.app` bundle.
- Windows: portable `.zip` and NSIS installer for `windows/amd64` and `windows/arm64`.
- Linux: `.deb` and `.AppImage` for Ubuntu 22.04/WebKit 4.0 compatible systems.
- Linux WebKit 4.1: `.deb` for Ubuntu 24.04 compatible systems.

Push a tag such as `v0.1.0`, or run the release workflows manually with the same tag.
The macOS workflow also keeps publishing `DataPanel-macOS.zip` from `main` for the Homebrew cask.

## Project Layout

- `internal/app`: Wails lifecycle and app paths.
- `internal/connections`: connection profiles, validation, and credential storage.
- `internal/postgres`: Postgres pooling, metadata, and query execution.
- `internal/query`: SQL orchestration, cancellation, history, and destructive-query analysis.
- `internal/settings`: persisted user settings.
- `frontend/src/app`: app shell, layout, and top-level state.
- `frontend/src/features`: feature-local UI and behavior.
- `frontend/src/lib`: typed Wails service boundary.

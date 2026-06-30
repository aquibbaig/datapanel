# DataPanel

<p align="center">
  <a href="https://github.com/aquibbaig/datapanel/releases/latest" target="_parent">
    <img alt="Latest release" height="20" src="https://img.shields.io/github/v/release/aquibbaig/datapanel?label=Download&labelColor=%23111&color=%23111" />
  </a>
  <a href="https://github.com/aquibbaig/datapanel/stargazers" target="_parent">
    <img alt="GitHub stars" height="20" src="https://img.shields.io/github/stars/aquibbaig/datapanel?logo=github&logoColor=white&label=Stars&labelColor=%23111&color=%23111" />
  </a>
  <a href="./LICENSE">
    <img alt="License: AGPL-3.0" height="20" src="https://img.shields.io/badge/License-AGPL--3.0-%23111" />
  </a>
</p>

Lightweight, open source database manager for browsing schemas, running SQL, and keeping database context ready for AI-assisted workflows.

<img width="1672" height="941" alt="datapanel_showcase" src="https://github.com/user-attachments/assets/35c9649c-d066-48e8-9363-db96c3d8ac29" />

## About

DataPanel is a desktop database workspace built with Wails, Go, React, TypeScript, and Vite. It focuses on local-first connection management, fast schema inspection, query execution, and structured metadata that can be used by assistant workflows.

## Goals

- Save database connection profiles without storing secrets in plain text.
- Test and open database connections.
- Browse schemas, tables, columns, indexes, and constraints.
- Execute SQL with query limits, cancellation, status feedback, and destructive-query warnings.
- Keep schema metadata structured so AI-assisted workflows can understand database context.

## Download

Download the latest macOS, Windows, and Linux builds from the GitHub Releases page:

https://github.com/aquibbaig/datapanel/releases/latest

Available release assets include:

- macOS: DMG installer window and zipped `.app` bundle.
- Windows: portable `.zip` and NSIS installer for x64 and arm64.
- Linux AppImage: portable build for distributions where the matching WebKit `.deb` is not available.

Linux `.deb` builds are WebKit-specific:

- Debian 13 or Ubuntu 24.04: use `datapanel_*_linux_amd64_debian13_ubuntu24.04_webkit2_41.deb`.
- Debian 12 or Ubuntu 22.04: use `datapanel_*_linux_amd64_debian12_ubuntu22.04_webkit2_40.deb`.
- Other Linux distributions: use the `.AppImage` when the matching WebKit package is not available.

## Contributing

Please read [`LOCAL.md`](./LOCAL.md) for local setup, development commands, release build notes, and project layout.

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for engineering principles, Go guidelines, frontend guidelines, and git hygiene.

## Sponsors

If you find DataPanel useful and want to support its maintenance and improvement, please consider sponsoring the project:

https://github.com/sponsors/aquibbaig

Sponsorship helps keep releases, platform installers, database adapter work, and open-source support moving.

## License

DataPanel is open source software licensed under the GNU Affero General Public License v3.0. See [`LICENSE`](./LICENSE).

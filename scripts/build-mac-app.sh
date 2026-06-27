#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/build/bin/DataPanel.app"

if ! command -v wails >/dev/null 2>&1; then
  echo "wails is required to build the macOS app." >&2
  echo "Install it from https://wails.io/docs/gettingstarted/installation" >&2
  exit 1
fi

cd "$ROOT_DIR"

"$ROOT_DIR/scripts/sync-app-icon.sh"

echo "Building DataPanel for macOS..."
release_version="${DATAPANEL_VERSION:-0.1.0}"
origin_url="$(git remote get-url origin 2>/dev/null || true)"
origin_slug="$(printf '%s' "$origin_url" | sed -E 's#^git@github.com:##; s#^https://github.com/##; s#\.git$##')"
origin_owner="$(printf '%s' "$origin_slug" | cut -d/ -f1)"
origin_repo="$(printf '%s' "$origin_slug" | cut -d/ -f2)"
github_owner="${DATAPANEL_GITHUB_OWNER:-${origin_owner:-aquibbaig}}"
github_repo="${DATAPANEL_GITHUB_REPO:-${origin_repo:-datapanel}}"
ldflags="-X datapanel/internal/updater.CurrentVersion=$release_version -X datapanel/internal/updater.CurrentReleaseHash=$release_version -X datapanel/internal/updater.GitHubOwner=$github_owner -X datapanel/internal/updater.GitHubRepo=$github_repo"
wails build -clean -skipbindings -m -nosyncgomod -ldflags "$ldflags"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Build finished, but $APP_PATH was not found." >&2
  exit 1
fi

echo "Built macOS app:"
echo "$APP_PATH"

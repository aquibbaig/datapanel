#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/build/bin/datapanel.app"
ICON_SOURCE="$ROOT_DIR/frontend/assets/logo-mark.png"
APP_ICON="$ROOT_DIR/build/appicon.png"

if ! command -v wails >/dev/null 2>&1; then
  echo "wails is required to build the macOS app." >&2
  echo "Install it from https://wails.io/docs/gettingstarted/installation" >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -f "$ICON_SOURCE" ]]; then
  echo "Missing app icon source: $ICON_SOURCE" >&2
  exit 1
fi

if command -v sips >/dev/null 2>&1; then
  echo "Generating macOS app icon from frontend/assets/logo-mark.png..."
  sips -z 1024 1024 "$ICON_SOURCE" --out "$APP_ICON" >/dev/null
else
  echo "sips is required to generate build/appicon.png on macOS." >&2
  exit 1
fi

echo "Building Datapanel for macOS..."
release_hash="${DATAPANEL_RELEASE_HASH:-$(git rev-parse HEAD 2>/dev/null || echo dev)}"
release_version="${DATAPANEL_VERSION:-0.1.0}"
github_owner="${DATAPANEL_GITHUB_OWNER:-aquibbaig}"
github_repo="${DATAPANEL_GITHUB_REPO:-datapanel}"
ldflags="-X datapanel/internal/updater.CurrentVersion=$release_version -X datapanel/internal/updater.CurrentReleaseHash=$release_hash -X datapanel/internal/updater.GitHubOwner=$github_owner -X datapanel/internal/updater.GitHubRepo=$github_repo"
wails build -ldflags "$ldflags"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Build finished, but $APP_PATH was not found." >&2
  exit 1
fi

echo "Built macOS app:"
echo "$APP_PATH"

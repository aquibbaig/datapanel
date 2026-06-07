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
wails build

if [[ ! -d "$APP_PATH" ]]; then
  echo "Build finished, but $APP_PATH was not found." >&2
  exit 1
fi

echo "Built macOS app:"
echo "$APP_PATH"

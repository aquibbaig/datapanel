#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_SOURCE="$ROOT_DIR/frontend/assets/logo-mark.png"
APP_ICON="$ROOT_DIR/build/appicon.png"
APP_ICON_TIFF="$ROOT_DIR/build/appicon.tiff"
MAC_APP_ICON="$ROOT_DIR/build/iconfile.icns"
DEV_APP_PATH="$ROOT_DIR/build/bin/DataPanel.app"
DEV_APP_ICON="$DEV_APP_PATH/Contents/Resources/iconfile.icns"

if [[ ! -f "$ICON_SOURCE" ]]; then
  echo "Missing app icon source: $ICON_SOURCE" >&2
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "sips is required to generate macOS app icons." >&2
  exit 1
fi

if ! command -v tiff2icns >/dev/null 2>&1; then
  echo "tiff2icns is required to generate macOS app icons." >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/build"
echo "Generating build/appicon.png from frontend/assets/logo-mark.png..."
sips -z 1024 1024 "$ICON_SOURCE" --out "$APP_ICON" >/dev/null
sips -z 1024 1024 -s format tiff "$ICON_SOURCE" --out "$APP_ICON_TIFF" >/dev/null
tiff2icns "$APP_ICON_TIFF" "$MAC_APP_ICON"

if [[ -d "$DEV_APP_PATH/Contents/Resources" ]]; then
  cp "$MAC_APP_ICON" "$DEV_APP_ICON"
  touch "$DEV_APP_PATH"
fi

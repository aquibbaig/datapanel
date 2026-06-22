#!/usr/bin/env sh
set -eu

tap_name="aquibbaig/datapanel"
tap_url="https://github.com/aquibbaig/datapanel.git"
cask_name="datapanel"
no_quarantine="0"

brew_has_datapanel_receipt() {
  brew list --cask "$cask_name" >/dev/null 2>&1
}

brew_has_datapanel_app() {
  brew list --cask "$cask_name" 2>/dev/null | grep -Eq '(^|/)DataPanel[.]app$'
}

install_datapanel() {
  if [ "$no_quarantine" = "1" ] && brew install --help 2>/dev/null | grep -q -- "--no-quarantine"; then
    brew install --cask --no-quarantine "$cask_name"
  else
    brew install --cask "$cask_name"
  fi
}

repair_stale_datapanel_receipt() {
  if brew_has_datapanel_receipt && ! brew_has_datapanel_app; then
    echo "Found stale Homebrew cask metadata without DataPanel.app; repairing..."
    brew uninstall --cask --force "$cask_name" >/dev/null 2>&1 || true
  fi
}

usage() {
  cat <<EOF
Usage: install-macos.sh [--no-quarantine]

Installs DataPanel with Homebrew Cask.

Options:
  --no-quarantine  Clear macOS quarantine after installing the app.
  -h, --help       Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-quarantine)
      no_quarantine="1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$(uname -s)" != "Darwin" ]; then
  echo "DataPanel's desktop app installer currently supports macOS only." >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install DataPanel." >&2
  echo "Install Homebrew from https://brew.sh, then run this script again." >&2
  exit 1
fi

echo "Tapping $tap_name..."
brew tap "$tap_name" "$tap_url"

if brew trust --help >/dev/null 2>&1; then
  echo "Trusting $tap_name..."
  brew trust --tap "$tap_name"
fi

echo "Installing DataPanel..."
repair_stale_datapanel_receipt
install_datapanel || {
  repair_stale_datapanel_receipt
  install_datapanel
}

if [ "$no_quarantine" = "1" ]; then
  echo "Clearing quarantine..."
  for app_path in "/Applications/DataPanel.app" "$HOME/Applications/DataPanel.app"; do
    if [ -d "$app_path" ]; then
      xattr -dr com.apple.quarantine "$app_path" >/dev/null 2>&1 || true
    fi
  done
fi

echo "DataPanel installed."

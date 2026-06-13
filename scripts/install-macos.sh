#!/usr/bin/env sh
set -eu

tap_name="aquibbaig/datapanel"
tap_url="https://github.com/aquibbaig/datapanel.git"
cask_name="datapanel"
no_quarantine="0"

usage() {
  cat <<EOF
Usage: install-macos.sh [--no-quarantine]

Installs Datapanel with Homebrew Cask.

Options:
  --no-quarantine  Ask Homebrew not to quarantine the app download.
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
  echo "Datapanel's desktop app installer currently supports macOS only." >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install Datapanel." >&2
  echo "Install Homebrew from https://brew.sh, then run this script again." >&2
  exit 1
fi

echo "Tapping $tap_name..."
brew tap "$tap_name" "$tap_url"

if brew trust --help >/dev/null 2>&1; then
  echo "Trusting $tap_name..."
  brew trust --tap "$tap_name"
fi

echo "Installing Datapanel..."
if [ "$no_quarantine" = "1" ]; then
  brew install --cask --no-quarantine "$cask_name"
else
  brew install --cask "$cask_name"
fi

echo "Datapanel installed."

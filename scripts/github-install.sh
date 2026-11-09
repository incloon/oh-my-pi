#!/bin/sh
# Install this fork's standalone omp from GitHub Releases.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/incloon/oh-my-pi/dev/scripts/github-install.sh | sh
# Pin a tag:
#   curl -fsSL .../github-install.sh | sh -s -- v18.18.0
set -eu

REPO="incloon/oh-my-pi"
INSTALL_DIR="${PI_INSTALL_DIR:-$HOME/.local/bin}"
REF="${1:-latest}"
OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" != "Linux" ] || [ "$ARCH" != "x86_64" ]; then
    echo "This fork publishes linux-x64 only (found ${OS} ${ARCH})." >&2
    exit 1
fi

ASSET="omp-linux-x64"
if [ "$REF" = "latest" ]; then
    BASE="https://github.com/${REPO}/releases/latest/download"
else
    BASE="https://github.com/${REPO}/releases/download/${REF}"
fi

mkdir -p "$INSTALL_DIR"
DOWNLOAD_PATH="${INSTALL_DIR}/.omp.download.$$"
trap 'rm -f "$DOWNLOAD_PATH"' EXIT
echo "Downloading ${ASSET} from ${REPO} (${REF})..."
curl -fsSL --retry 3 "$BASE/$ASSET" -o "$DOWNLOAD_PATH"
EXPECTED="$(curl -fsSL --retry 3 "$BASE/${ASSET}.sha256" | awk '{print tolower($1)}')"
if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL="$(sha256sum "$DOWNLOAD_PATH" | awk '{print tolower($1)}')"
else
    ACTUAL="$(shasum -a 256 "$DOWNLOAD_PATH" | awk '{print tolower($1)}')"
fi
if [ "$ACTUAL" != "$EXPECTED" ]; then
    echo "Checksum mismatch: expected $EXPECTED, got $ACTUAL" >&2
    exit 1
fi
chmod +x "$DOWNLOAD_PATH"
mv -f "$DOWNLOAD_PATH" "${INSTALL_DIR}/omp"
trap - EXIT
echo "Installed ${INSTALL_DIR}/omp"
case ":$PATH:" in
    *":$INSTALL_DIR:"*) echo "Run omp to get started." ;;
    *) echo "Add ${INSTALL_DIR} to PATH, then run omp." ;;
esac

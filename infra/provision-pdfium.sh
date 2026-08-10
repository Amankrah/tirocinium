#!/usr/bin/env bash
# Provision the pinned pdfium native binary into crates/platform_core/pdf/vendor
# (decision 0024). Extracted from setup.sh so the version pin lives in exactly
# one place and CI can provision pdfium without running the whole bootstrap:
# the Phase 4 decode and figure gates only assert anything real where this has
# run, so the jobs that claim those gates call this first.
#
# Idempotent: does nothing when a binary is already vendored. Warns rather than
# fails on an unmapped host or a download failure, because the tests that need
# pdfium skip with a stated reason when it is absent.
#
#   ./infra/provision-pdfium.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PDFIUM_VERSION="chromium/7961"  # pinned pdfium binary (decision 0024)
PDF_VENDOR="$ROOT/crates/platform_core/pdf/vendor"

warn() { printf '\033[33mwarning: %s\033[0m\n' "$*"; }

mkdir -p "$PDF_VENDOR"
if [ -f "$PDF_VENDOR/bin/pdfium.dll" ] || [ -f "$PDF_VENDOR/lib/libpdfium.so" ] \
   || [ -f "$PDF_VENDOR/lib/libpdfium.dylib" ]; then
  echo "already present"
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  MINGW*-*|MSYS*-*|CYGWIN*-*) PDF_ASSET="pdfium-win-x64.tgz" ;;
  Linux-x86_64)               PDF_ASSET="pdfium-linux-x64.tgz" ;;
  Linux-aarch64)              PDF_ASSET="pdfium-linux-arm64.tgz" ;;
  Darwin-x86_64)              PDF_ASSET="pdfium-mac-x64.tgz" ;;
  Darwin-arm64)               PDF_ASSET="pdfium-mac-arm64.tgz" ;;
  *)                          PDF_ASSET="" ;;
esac

if [ -z "$PDF_ASSET" ] || ! command -v curl >/dev/null 2>&1; then
  warn "no pdfium build mapped for this host ($(uname -s)-$(uname -m)); set TIRO_PDFIUM_LIB"
  exit 0
fi

# The release tag carries a slash, so URL-encode it.
PDF_TAG="${PDFIUM_VERSION/\//%2F}"
PDF_URL="https://github.com/bblanchon/pdfium-binaries/releases/download/$PDF_TAG/$PDF_ASSET"
if curl -fsSL "$PDF_URL" -o "$PDF_VENDOR/$PDF_ASSET"; then
  # The archive carries bin/ (Windows) or lib/ (Linux, macOS); extract both so
  # the crate and the Python resolver find whichever this platform produced.
  tar -xzf "$PDF_VENDOR/$PDF_ASSET" -C "$PDF_VENDOR" bin lib 2>/dev/null || \
    tar -xzf "$PDF_VENDOR/$PDF_ASSET" -C "$PDF_VENDOR"
  rm -f "$PDF_VENDOR/$PDF_ASSET"
  echo "pdfium provisioned"
else
  warn "pdfium download failed; PDF import (Phase 4) decode cannot run without it"
fi

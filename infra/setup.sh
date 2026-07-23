#!/usr/bin/env bash
# Tirocinium one-command bootstrap (Phase 0.2).
#
# From a clean checkout to a verified working state: Rust toolchain, Python
# environment (uv-managed, pinned by apps/api/uv.lock), the mastery extension
# built into the venv, dev services validated, and the existing test gates run.
# Idempotent: safe to re-run; each step checks before it acts.
#
#   ./infra/setup.sh            full bootstrap + verification
#   TIRO_SKIP_CRITERION=1 ...   skip the slow cargo-criterion install
#   TIRO_SKIP_VERIFY=1 ...      provision only, no gate run
#
# Runs under bash on Linux, macOS, and Windows (Git Bash). Litestream and the
# compose services target the Unix CI/deploy environments; on hosts without
# docker or a litestream build the steps warn and continue rather than fail,
# because neither is needed until Phase 1.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="$ROOT/apps/api"
CRATES="$ROOT/crates/platform_core"
LITESTREAM_VERSION="v0.3.13"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
warn() { printf '\033[33mwarning: %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- Rust
say "Rust toolchain"
if command -v rustup >/dev/null 2>&1; then
  rustup toolchain install stable --profile default >/dev/null 2>&1 || true
  rustup component add clippy rustfmt >/dev/null 2>&1 || true
  rustc --version
elif command -v cargo >/dev/null 2>&1; then
  # Phases doc 0.2: sandboxes without rustup fall back to the distro toolchain.
  warn "rustup not found; using the system toolchain ($(rustc --version))"
else
  echo "error: no Rust toolchain. Install rustup: https://rustup.rs" >&2
  exit 1
fi

if [ "${TIRO_SKIP_CRITERION:-0}" != "1" ]; then
  if ! command -v cargo-criterion >/dev/null 2>&1; then
    say "Installing cargo-criterion (one-time, compiles from source)"
    cargo install cargo-criterion --locked
  fi
else
  warn "skipping cargo-criterion (TIRO_SKIP_CRITERION=1)"
fi

# ---------------------------------------------------------------- Python
say "Python environment (uv, pinned by uv.lock)"
if ! command -v uv >/dev/null 2>&1; then
  if command -v pipx >/dev/null 2>&1; then pipx install uv
  elif command -v pip >/dev/null 2>&1; then pip install --user uv
  else
    echo "error: neither uv, pipx, nor pip found. Install uv: https://docs.astral.sh/uv/" >&2
    exit 1
  fi
fi
# Creates .venv with the pinned interpreter (.python-version), resolves and
# installs the locked dependency set, writing uv.lock on first run.
(cd "$API" && uv sync)

VENV="$API/.venv"
if [ -x "$VENV/bin/python" ]; then VBIN="$VENV/bin"; else VBIN="$VENV/Scripts"; fi
PY="$VBIN/python"

say "Building the platform_core extension into the venv (maturin, release)"
VIRTUAL_ENV="$VENV" "$VBIN/maturin" develop --release \
  --manifest-path "$CRATES/python/Cargo.toml"

# ---------------------------------------------------------------- Litestream
say "Litestream ($LITESTREAM_VERSION, binary in infra/bin)"
mkdir -p "$ROOT/infra/bin"
if [ -x "$ROOT/infra/bin/litestream" ] || [ -x "$ROOT/infra/bin/litestream.exe" ]; then
  echo "already present"
else
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)  ASSET="litestream-$LITESTREAM_VERSION-linux-amd64.tar.gz" ;;
    Linux-aarch64) ASSET="litestream-$LITESTREAM_VERSION-linux-arm64.tar.gz" ;;
    Darwin-*)      ASSET="litestream-$LITESTREAM_VERSION-darwin-amd64.zip" ;;
    *)             ASSET="" ;;
  esac
  if [ -n "$ASSET" ] && command -v curl >/dev/null 2>&1; then
    URL="https://github.com/benbjohnson/litestream/releases/download/$LITESTREAM_VERSION/$ASSET"
    if curl -fsSL "$URL" -o "$ROOT/infra/bin/$ASSET"; then
      case "$ASSET" in
        *.tar.gz) tar -xzf "$ROOT/infra/bin/$ASSET" -C "$ROOT/infra/bin" litestream ;;
        *.zip)    unzip -o -q "$ROOT/infra/bin/$ASSET" litestream -d "$ROOT/infra/bin" ;;
      esac
      rm -f "$ROOT/infra/bin/$ASSET"
      "$ROOT/infra/bin/litestream" version
    else
      warn "litestream download failed; needed from Phase 1.3 (backups)"
    fi
  else
    warn "no litestream build for this host ($(uname -s)); needed from Phase 1.3 in CI/deploy"
  fi
fi

# ---------------------------------------------------------------- Node / web
say "Web workspace"
if [ -f "$ROOT/apps/web/package.json" ]; then
  if command -v pnpm >/dev/null 2>&1; then
    (cd "$ROOT/apps/web" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install)
  else
    warn "pnpm not found; install via corepack (corepack enable pnpm)"
  fi
else
  echo "apps/web not scaffolded yet (frontend milestone); skipping"
fi

# ---------------------------------------------------------------- Services
say "Dev services (MinIO, Redis)"
if command -v docker >/dev/null 2>&1; then
  docker compose -f "$ROOT/infra/docker-compose.yml" config -q && echo "compose file valid"
else
  warn "docker not found; MinIO/Redis unavailable (needed from Phase 1)"
fi

# ---------------------------------------------------------------- Verify
if [ "${TIRO_SKIP_VERIFY:-0}" = "1" ]; then
  warn "skipping verification (TIRO_SKIP_VERIFY=1)"
  exit 0
fi

say "Gate: pinned dependencies import"
"$PY" - <<'EOF'
import importlib, sys
MODULES = {
    "fastapi": "fastapi", "uvicorn": "uvicorn", "pydantic": "pydantic",
    "arq": "arq", "redis": "redis", "httpx": "httpx",
    "python-multipart": ("python_multipart", "multipart"),
    "argon2-cffi": "argon2", "pyjwt": "jwt", "boto3": "boto3",
    "anthropic": "anthropic", "fpdf2": "fpdf",
    "pytest": "pytest", "ruff": "ruff", "mypy": "mypy",
    "platform_core (built extension)": "platform_core",
    "platform_core.codec": "platform_core.codec",
    "platform_core.mastery": "platform_core.mastery",
    "platform_core.preprocess": "platform_core.preprocess",
}
failed = []
for name, mods in MODULES.items():
    mods = (mods,) if isinstance(mods, str) else mods
    for m in mods:
        try:
            importlib.import_module(m)
            break
        except ImportError:
            continue
    else:
        failed.append(name)
print(f"python {sys.version.split()[0]}")
if failed:
    sys.exit("missing: " + ", ".join(failed))
print(f"all {len(MODULES)} import checks pass")
EOF

say "Gate: ruff + mypy strict (apps/api)"
(cd "$API" && "$VBIN/ruff" check . && "$VBIN/mypy" .)

say "Gate: Rust workspace suites (mastery 15, codec 8, preprocess 7)"
(cd "$CRATES" && cargo test --workspace --quiet)

say "Gate: Python suite (apps/api)"
(cd "$API" && "$PY" -m pytest -q)

say "setup.sh complete: environment provisioned and gates green"

#!/usr/bin/env bash
# Installs OpenClaude's dependencies for local development / packaging.
#
# Why this script exists:
#   `@shipany/open-agent-sdk@0.1.7` ships a postinstall hook that runs
#   `node scripts/create-shims.mjs`, but that file is missing from the
#   published tarball. A plain `npm install` therefore fails on a fresh
#   clone. We only need the SDK's runtime, not the CLI shim, so we pass
#   `--ignore-scripts` and then manually trigger the postinstalls we do
#   care about (primarily Electron's binary download).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/2] Installing npm dependencies (skipping package postinstalls)..."
npm install --ignore-scripts --no-audit --no-fund "$@"

if [ -f "node_modules/electron/install.js" ]; then
  echo "[2/2] Downloading matching Electron binary..."
  node node_modules/electron/install.js
else
  echo "[2/2] Electron not installed (dev dependency skipped); nothing to do."
fi

echo ""
echo "Setup complete. Next steps:"
echo "  npm run dev             # run in development mode"
echo "  npm run package:mac     # build a signed-ad-hoc .app + .dmg"

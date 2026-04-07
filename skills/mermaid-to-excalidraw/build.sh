#!/usr/bin/env bash
# Build the mermaid-to-excalidraw playground and install it into this skill's dist/ dir.
# Run once to set up, or re-run to update to the latest upstream version.
#
# Requirements: git, yarn, node

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP=$(mktemp -d)

cleanup() {
  echo "→ Cleaning up..."
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "→ Cloning mermaid-to-excalidraw..."
git clone git@github.com:excalidraw/mermaid-to-excalidraw.git "$TMP"

echo "→ Installing dependencies..."
cd "$TMP"
yarn install --frozen-lockfile

echo "→ Building playground..."
yarn build:playground
# Output lands at $TMP/public/ (hardcoded in playground/vite.config.ts)

echo "→ Installing into skill..."
rm -rf "$SKILL_DIR/dist"
cp -r "$TMP/public" "$SKILL_DIR/dist"

echo "✓ Done! Playground built at $SKILL_DIR/dist/"
echo "  Run: node $SKILL_DIR/render.mjs \"<mermaid definition>\""

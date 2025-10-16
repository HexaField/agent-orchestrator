#!/usr/bin/env bash
# File: copilot-mini.sh
#
# What it does:
#  1) Locates the installed @github/copilot/index.js (global npm package)
#  2) Backs it up
#  3) Rewrites the "allowed models" array to include many more models, incl. gpt-5-mini
#  4) Writes ~/.copilot/config.json with "model": "gpt-5-mini"
#
# Usage:
#   chmod +x copilot-mini.sh
#   ./copilot-mini.sh
#
# Undo:
#   cp "$INDEX_JS.bak" "$INDEX_JS"
#   rm -f ~/.copilot/config.json  # (or edit it to your liking)

set -euo pipefail

# --- prerequisites ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required on PATH." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required on PATH." >&2
  exit 1
fi

# --- locate @github/copilot/index.js ------------------------------------------
NPM_ROOT="$(npm root -g 2>/dev/null)"
INDEX_JS="$NPM_ROOT/@github/copilot/index.js"

if [[ ! -f "$INDEX_JS" ]]; then
  echo "Could not find @github/copilot/index.js at:"
  echo "  $INDEX_JS"
  echo "Is @github/copilot installed globally? Try: npm i -g @github/copilot"
  exit 1
fi

echo "Found: $INDEX_JS"

# --- backup once --------------------------------------------------------------
if [[ ! -f "$INDEX_JS.bak" ]]; then
  cp "$INDEX_JS" "$INDEX_JS.bak"
  echo "Backup created: $INDEX_JS.bak"
else
  echo "Backup already exists: $INDEX_JS.bak"
fi

# --- desired allowed-models list ----------------------------------------------
# This mirrors the array you proposed (order preserved)
# Use a subshell capture with cat so the command exits with status 0 under set -e.
DESIRED_JSON_ARRAY=$(cat <<'JSON'
["gpt-4o","gpt-5","gpt-5-mini","grok-code-fast-1","o3-mini","o1","claude-3.5-sonnet","claude-3.7-sonnet","claude-3.7-sonnet-thought","claude-sonnet-4","claude-sonnet-4.5","gemini-2.0-flash-001","gemini-2.5-pro","gpt-4.1","o4-mini"]
JSON
)

# --- patch index.js in-place --------------------------------------------------
# Strategy:
#  - Find the FIRST occurrence of an assignment to an array literal that contains "gpt-5"
#    (e.g., =["claude-sonnet-4.5","claude-sonnet-4","gpt-5"];)
#  - Replace that entire array literal with our DESIRED_JSON_ARRAY
#
# We use Node for a robust regex + write (no sed quoting nightmares).
TMP_JS="$(mktemp --suffix=.mjs 2>/dev/null || mktemp /tmp/copilotXXXXXX.mjs)"
cat > "$TMP_JS" <<'JS'
import fs from 'node:fs';

// process.argv: [node, script, INDEX_JS, REPLACEMENT_JSON]
const [,, file, replacementJson] = process.argv;
const src = fs.readFileSync(file, 'utf8');

// Regex: find an equals sign followed by an array literal that contains the token "gpt-5".
// This targets the actual models list instead of the first array in the file.
const pattern = /=\s*\[[^\]]*?gpt-5[^\]]*?\]\s*;/
const match = src.match(pattern);

if (!match) {
  console.error("Error: Could not locate the models array assignment containing 'gpt-5' in index.js");
  process.exit(2);
}

const newChunk = `=${replacementJson};`;
const patched = src.replace(pattern, newChunk);

if (patched === src) {
  console.error("Warning: No change detected. Maybe already patched?");
} else {
  fs.writeFileSync(file, patched, 'utf8');
  console.log("Patched models array in:", file);
}
JS

trap 'rm -f "$TMP_JS"' EXIT
node "$TMP_JS" "$INDEX_JS" "$DESIRED_JSON_ARRAY"
RET=$?
trap - EXIT
rm -f "$TMP_JS"
RET=$?
if [[ $RET -ne 0 ]]; then
  echo "Patching failed with code $RET"
  exit $RET
fi

# --- write ~/.copilot/config.json with your preferred model -------------------
CFG_DIR="$HOME/.copilot"
CFG_FILE="$CFG_DIR/config.json"
mkdir -p "$CFG_DIR"

# If jq is present, update in-place; otherwise write a minimal config.
if command -v jq >/dev/null 2>&1 && [[ -f "$CFG_FILE" ]]; then
  # Merge or set fields while preserving any existing settings
  TMP="$(mktemp)"
  jq '.banner = "never" | .model = "gpt-5-mini" | .render_markdown = ( .render_markdown // true ) | .screen_reader = ( .screen_reader // false ) | .theme = ( .theme // "auto" )' \
     "$CFG_FILE" > "$TMP"
  mv "$TMP" "$CFG_FILE"
  echo "Updated existing config: $CFG_FILE"
else
  cat > "$CFG_FILE" <<'JSON'
{
  "banner": "never",
  "model": "gpt-5-mini",
  "render_markdown": true,
  "screen_reader": false,
  "theme": "auto"
}
JSON
  echo "Wrote new config: $CFG_FILE"
fi

echo
echo "Done. Try starting the CLI with: copilot"
echo "If models still seem restricted, it may be due to policy/entitlement on your account/org (the CLI frequently errors with “No supported model available” when a model isn’t allowed for your plan)."

#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js 20+ is required to run SAT Question Bank Exporter."
  echo "Install Node.js from https://nodejs.org/ and run this launcher again."
  echo
  read -r -p "Press Enter to close..."
  exit 1
fi

set +e
node scripts/launch.mjs
status=$?
set -e

if [ "$status" -ne 0 ]; then
  echo
  echo "The launcher did not finish successfully."
  echo
  read -r -p "Press Enter to close..."
fi

exit "$status"

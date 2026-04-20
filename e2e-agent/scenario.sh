#!/usr/bin/env bash
# Small agent-driven smoke test for the Bank app.
#
# Runs a handful of agent-browser commands against TARGET_URL and tees the
# full log to last-run.log so the wterm viewer (viewer.html) can replay it.
#
# Usage:
#   TARGET_URL=http://3.138.139.3 ./scenario.sh
#   TARGET_URL=http://localhost:5173 ./scenario.sh     (default)

set -u

# Default to the local Vite dev server. If you want to point this at the
# deployed EC2 box (http://3.138.139.3), note that the bundled Chrome in
# agent-browser blocks raw-IP URLs with ERR_BLOCKED_BY_CLIENT — add a local
# hosts entry (e.g. `echo "3.138.139.3 bank.local" | sudo tee -a /etc/hosts`)
# and use TARGET_URL=http://bank.local instead.
TARGET_URL="${TARGET_URL:-http://localhost:5173}"
LOG_FILE="$(dirname "$0")/last-run.log"
AB="$(dirname "$0")/node_modules/.bin/agent-browser"

if [[ ! -x "$AB" ]]; then
  echo "agent-browser not installed. Run: (cd e2e-agent && npm install)" >&2
  exit 1
fi

# Clear old log, then tee everything from this point on.
: > "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

step() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }
pass() { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
fail() { printf "\033[1;31m✗ %s\033[0m\n" "$*"; exit 1; }

step "Target: $TARGET_URL"
step "agent-browser $($AB --version 2>&1 || echo unknown)"

step "open landing page"
$AB open "$TARGET_URL" || fail "could not open $TARGET_URL"

step "wait for load"
$AB wait --load networkidle || fail "page never reached networkidle"

step "snapshot interactive elements"
$AB snapshot -i -c || fail "snapshot failed"

step "locate login link"
if $AB find role link --name "log in" 2>/dev/null \
  || $AB find role link --name "sign in" 2>/dev/null \
  || $AB find role link --name "login" 2>/dev/null; then
  pass "login link visible"
else
  step "no login link at role=link, checking buttons"
  $AB find role button --name "log in" 2>/dev/null && pass "login button visible" \
    || echo "(no explicit login link/button — landing page may vary)"
fi

step "capture landing screenshot"
mkdir -p "$(dirname "$0")/screenshots"
$AB screenshot "$(dirname "$0")/screenshots/landing.png" 2>&1 \
  && pass "screenshot saved to screenshots/landing.png" \
  || echo "(screenshot step failed)"

step "done"
pass "scenario complete. log: $LOG_FILE"

# e2e-agent — agent-browser + wterm smoke demo

A tiny demo pairing **agent-browser** (test runner, drives Chrome via CDP) with
**wterm** (in-browser terminal emulator that replays the run log). Both are
Vercel Labs projects.

## One-time setup

```bash
cd e2e-agent
npm install    # installs agent-browser CLI and @wterm/dom (~72 MB for the Rust binary)
```

## Run a scenario

```bash
# Against local dev:
./scenario.sh

# Against the deployed EC2 instance:
TARGET_URL=http://3.138.139.3 ./scenario.sh
```

The scenario opens the target, waits for network idle, snapshots interactive
elements, looks for a login link, and captures a screenshot. Every line goes
into `last-run.log`.

## Watch it in wterm

```bash
npm run view   # starts python3 -m http.server on :4173
# open http://localhost:4173/viewer.html
```

Hit **Reload log** after each `./scenario.sh` run to replay the latest output
with ANSI colors rendered inside wterm.

## What each tool does

| Piece | Role |
|---|---|
| `scenario.sh` | Invokes `agent-browser` commands, tees all output to `last-run.log` |
| `agent-browser` | Test runner — drives Chrome, produces compact accessibility snapshots and element refs |
| `viewer.html` | Loads `last-run.log` and pipes it through `@wterm/dom` for rendering |
| `wterm` | Pure viewer — no test logic, just renders the stream |

## Why this pairing

- agent-browser gives you deterministic browser automation without a second
  LLM (Claude Code itself drives it) — no API key, no token spend beyond the
  Claude subscription already in use.
- wterm gives you a browser-embeddable replay surface without needing a full
  xterm.js integration.

Together they're a minimal "agent runs against the deploy, operator watches"
loop that complements the existing Playwright suite.

## Non-goals

- Not a replacement for `frontend/e2e/` Playwright tests (which remain the
  deterministic regression suite).
- Not wired to CI yet — this is a local/demo setup.
- `viewer.html` is a static replay page, not a live stream. A future upgrade
  would be an SSE endpoint in the backend for real-time streaming, but that
  is deliberately out of scope here.

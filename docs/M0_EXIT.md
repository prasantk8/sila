# SILA M0 — Exit Criteria (§6.6)

M0 is "done" when it has run **three real Dubai rooms** end to end. The build is the prerequisite; the criterion is evidence from real players.

## Build gates (all ✅ in this drop)
- [x] Player PWA: installable, phase-keyed breathing UI, physical buzzer (<50 ms debounce + haptic), time-sync, captions + device TTS, reconnect.
- [x] Operator Console: phase gates, prompt deck, Rawi line deck with slot-fill, live T0 roster telemetry, directives, moments, safety hold, E-loop tools, outcome view.
- [x] Engine: single-writer actor, JSONL log (append-before-fanout), snapshot restore, RTT-compensated buzz + photo-finish, all mechanics, safety hold with restricted incident file.
- [x] Soak test: 54 assertions green (`npm run sim`) — buzz fairness, photo finish, tap/submit, submission privacy, safety freeze, restore, full E2E.
- [x] Docs: README, PROTOCOL, ARCHITECTURE, OPERATOR_RUNBOOK, DECISIONS, this checklist.

## Live-room criteria (to collect on the ground)
- [ ] Room reliably lands in the **88–95 min** window (check `outcome.json.landed_in_window`).
- [ ] **Every** player leaves with ≥1 highlight (`outcome.json.every_user_highlight === true`) across all three rooms.
- [ ] Final `gini_participation` trends **down** over the session (balance improved) — read the tuning corpus.
- [ ] At least one cohort **christened** and one **next-time poll** tapped in-room per room.
- [ ] Zero safety incidents mishandled; any hold resolved with dignity.
- [ ] Event corpus captured across the three rooms to tune §4 thresholds before M1.

## What M0 deliberately does NOT do
Autonomous pacing (M1 Pacer), generative Rawi (M2 CTA), autonomous chemistry directives (M3 ICA), the async Loop layer / presence pings (M4), T1 acoustic sensing. Every one has a `SEAM:` marker and a live contract already exercised by the human operator.

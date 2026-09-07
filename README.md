# SILA · M0 — The Invisible Host

> Tonight, strangers. Later, a group chat.

SILA runs a 90-minute, in-person social game for ~6 people at a table. An unseen host — **Rawi** — paces the room, sparks laughter, and turns a one-off night into a standing cohort, *without* building a feed. **M0** is the Wizard-of-Oz build: the deterministic reflex layer (buzzers, scores, safety) is real; a human operator plays Rawi through a console. It exists to run three real Dubai rooms and prove the loop before any AI takes the wheel.

## Quickstart
```bash
npm install
npm run build      # tsc → dist/
npm start          # boots on :8080, prints the ops key
```
Then, on the venue LAN:
- **Players** open `http://<laptop-ip>:8080/play` (or `…/play?room=<id>`), pick a name, take a seat.
- **Operator** opens `http://<laptop-ip>:8080/ops`, pastes the printed ops key, clicks **+ New room**.

`npm run dev` builds and runs in one step. `npm run sim` runs the soak test (41 assertions).

Env: `PORT` (default 8080), `SILA_OPS_KEY` (auto-generated + persisted if unset), `SILA_DATA` (default `./data`).

## Repo map
```
server/         the room engine (TypeScript, Node ≥20)
  contracts.ts    normative WS types + RoomState (§2.3)
  actor.ts        RoomActor — one room = one actor, single writer
  log.ts          append-only JSONL log + snapshot restore
  config.ts       Appendix A session tunables
  features.ts     T0 telemetry (shares, gini, buzz medians, laugh proxy)
  lines.ts        content store: packs + Rawi line library
  tickets.ts      HMAC compact room tickets
  server.ts       HTTP static + REST + WS transport
public/
  play/           player PWA (buzzer, captions, breathing UI, service worker)
  ops/            operator console
content/
  packs.json      Dubai-flavoured prompt packs, phases A–E
  lines.json      Rawi fallback line library (Appendix B format)
  roster.sample.json  six sample players for dry-runs
scripts/sim.ts    soak test (actor determinism + full E2E)
docs/             PROTOCOL · ARCHITECTURE · OPERATOR_RUNBOOK · DECISIONS · M0_EXIT
```

## How a night flows
`LOBBY → A_BASELINE → B_REACTION → C_DISCOVERY → D_IMPROV → E_LOOP → CLOSED`, with orthogonal `SAFETY_HOLD` / `PAUSED` / `CANCELLED_GRACEFUL`. Inside each phase, rounds cycle `ROUND_INTRO → PROMPT_OPEN → BUZZ_LOCK → ADJUDICATE → CELEBRATE → INTERSTITIAL`. The operator drives phase and voice; the engine owns fairness, scoring, connection, and safety. Full play-by-play in `docs/OPERATOR_RUNBOOK.md`.

## Design spine (from the blueprint)
- **One room = one actor.** Single writer of state; scale by adding actors, never shared state.
- **The log is the truth.** Every event is appended before fan-out; the log *is* the observability + replay system.
- **Buzz fairness is server-authoritative:** order = `t_recv − rtt/2`, 150 ms lock window, 30 ms photo-finish.
- **Identity is won, not handed over.** Personal facts enter play only from a consented vault, only as earned C-phase reveals.
- **Safety > dignity > inclusion > pacing > fun > score-drama** — the priority lattice, in that order.
- **Quiet luxury.** The screen doesn't flash. It breathes.

## Roadmap
| | |
|---|---|
| **M0** (this) | Wizard-of-Oz: human operator as Pacer/CTA/ICA |
| M1 | Pacer agent takes phase timing (`SEAM:` in tick loop) |
| M2 | CTA renders Rawi from the same `s.host_say` contract |
| M3 | ICA authors targeting directives autonomously |
| M4 | The async Loop layer (quota-capped presence, no feed) |
| M5 | T1 acoustic sensing upgrades the telemetry |

Every seam is marked `SEAM:` in code, and the contract each future agent will use is already exercised by the human operator today.

## License
AGPL-3.0. See `LICENSE`.

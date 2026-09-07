# SILA M0 — Architecture

## One process, three surfaces
```
                    ┌─────────────────────────────────────────┐
  players ─ws──────▶│  Node server (server/server.ts)         │
  (PWA /play)       │   • static hosting  /play  /ops         │
                    │   • REST  /api/*                        │
  operator ─ws─────▶│   • WS upgrade → RoomActor              │
  (console /ops)    │                                         │
                    │   ┌───────────────────────────────────┐ │
                    │   │ RoomActor  (one room = one actor)  │ │  ← server/actor.ts
                    │   │  single-writer command queue      │ │
                    │   │  commit → JSONL log → snapshot →   │ │
                    │   │  fan-out (s.*) / push (ops.view)   │ │
                    │   └───────────────────────────────────┘ │
                    └───────────────┬─────────────────────────┘
                     data/rooms/<id>/{events.jsonl, snapshot.json,
                                      safety.jsonl, outcome.json}
```

Every input — client message, operator command, 1 s tick — is one `Command` on the actor's serialized queue. The actor is the **only** writer of `RoomState`. Horizontal scale = more actors, never shared state (blueprint §1.3).

## Module → file map
| Blueprint module | M0 file |
|---|---|
| Brainstem / Orchestrator Kernel (§2.2.1) | `server/actor.ts` |
| Event-sourced log + snapshots (§2.3, §6.2) | `server/log.ts` |
| Session config tunables (Appendix A) | `server/config.ts` |
| WS contract + RoomState (§2.3) | `server/contracts.ts` |
| Social Neocortex / T0 telemetry (§4.1) | `server/features.ts` |
| Larynx fallback library / Rawi (§Module 6, Appendix B) | `server/lines.ts` + `content/lines.json` |
| Hand / PWA (§Module 3) | `public/play/*` |
| Room tickets (§6.3) | `server/tickets.ts` |
| Prompt packs | `content/packs.json` |

## The Wizard-of-Oz seam
In M0 the **operator is the kernel's missing organs**. What the engine still owns autonomously (the L0 reflex layer):
- buzz lock + RTT-compensated adjudication + photo-finish
- score maths, connection lifecycle (CONNECTED→LAGGING→DROPPED), speaker election
- SAFETY_HOLD freeze, phase-gate guards (linear order, min-time, LOBBY≥4)
- laugh-proxy → auto moment tagging, clock + pacing telemetry

What the operator drives by hand (with the engine surfacing advisories):
- phase transitions (engine warns at budget max — **SEAM: M1 Pacer** turns these into authority)
- every Rawi line (**SEAM: M2 CTA** renders these from the same `s.host_say` contract)
- targeting directives / interventions (**SEAM: M3 ICA** authors `chemistry.targeting_directive`)

Grep the codebase for `SEAM:` to find every plug-in point. The contracts the agents will use already exist and are exercised in M0 by the human.

## Data at rest (per room)
- `events.jsonl` — the append-only truth; shareable, PII-minimized
- `snapshot.json` — latest full state (atomic tmp+rename), the restart path
- `safety.jsonl` — restricted-ACL incident file; reporter identity lives **only** here, never in the shared log
- `outcome.json` — landing time, gini_final, per-user highlight coverage, score_pct — the tuning corpus for §4 thresholds

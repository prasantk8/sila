# SILA M0 — Wire Protocol

All timing-critical truth is server-authoritative. Clients are dumb terminals that render `s.*` and emit `c.*`. The operator emits `ops.*`. Types are defined normatively in `server/contracts.ts`.

## Event envelope (§2.3)
Every internal event is appended to the room's `events.jsonl` **before** any fan-out:
```json
{ "event_id": "evt_…", "room_id": "room_…", "seq": 1482,
  "ts_server": "2026-07-05T19:42:11.284Z", "source": "orch",
  "type": "orch.round_result", "payload": { … } }
```
`seq` is a per-room monotonic integer assigned at commit — the total order. Consumers dedupe on `(room_id, seq)`.

## REST
| Method | Path | Auth | Body / Result |
|---|---|---|---|
| POST | `/api/rooms` | ops_key | → `{ room_id }` |
| GET  | `/api/rooms` | — | public list: `{ room_id, master_state, seated }[]` |
| POST | `/api/rooms/:id/join` | — | `{ display, affinity_tags?, vault? }` → `{ uid, ticket }` |
| GET  | `/api/content/packs` \| `/lines` | — | content arrays |
| GET  | `/api/rooms/:id/summary?key=` | ops_key | `{ state, outcome, events_tail }` |
| GET  | `/api/rooms/:id/events?key=&n=` | ops_key | event tail |

`vault` facts are **consented** onboarding data — the only personal facts that may ever enter play, and only as C-phase reveal ammunition.

## Player WebSocket — `/ws/room/:id`

**Client → server (`c.*`)**
| type | when |
|---|---|
| `c.hello` | first frame: `{ uid, room_ticket, last_seq?, device_caps? }`. Ticket verified here. |
| `c.time_ping` | 5× at join then every 120 s; answered at transport for min jitter |
| `c.buzz` | `{ prompt_id, t_client }` — <50 ms client debounce |
| `c.answer` | `{ prompt_id, value }` — tap index / submit text / buzz-winner answer |
| `c.react` | `{ emoji_code }` |
| `c.leave_discreet` | graceful exit |
| `c.safety` | `{ severity }` — HIGH/CRITICAL → SAFETY_HOLD |

**Server → client (`s.*`)**
`s.hello_ack`, `s.time_pong`, `s.state_sync` (RoomState-lite: no vault, no submission content, no answer keys), `s.prompt`, `s.buzz_lock`, `s.buzz_result`, `s.score`, `s.host_say`, `s.reveal_grant`, `s.role_assign`, `s.phase`, `s.tap_tally`, `s.hold`, `s.pause`, `s.send_off`, `s.error`.

### Buzz fairness (§2.3)
Server stamps `t_recv_ms` at the socket, before any queueing. Authoritative order is `t_adj = t_recv − rtt/2`, where `rtt` is a server-measured ping/pong EWMA. First valid buzz → `s.buzz_lock` + a 150 ms wall-clock collection window (so a high-RTT early press can still overtake a low-RTT late arrival). At window close, buzzes sort by `t_adj`; if the top two are within 30 ms it's a `photo_finish` (auto-tagged as a moment).

### Reconnect (§6.3)
Client stores `last_seq`. On `c.hello` the server replays committed `s.*` events with `seq > last_seq` (capped at 50) after a fresh `s.state_sync`; beyond the cap, snapshot-only.

## Operator WebSocket — `/ws/ops/:id?key=`
Server pushes a full `{ type: "ops.view", view }` (`OpsView`: state + warnings + pending submissions + vault) on every commit and tick. Operator emits `ops.*`: `state_transition`, `round_open`, `round_lock_now`, `adjudicate`, `round_scrap`, `host_say`, `reveal_grant`, `role_assign`, `moment_tag`, `directive_set/clear`, `hold`, `pause`, `cancel_graceful`, `poll_open/close`, `christen`, `speaker_elect`, `close_room`.

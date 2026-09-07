# SILA M0 — Design Decisions

Numbered, so the code can point back here. Each records **what** we chose for M0 and the **migration path** to the full blueprint. The rule throughout: *boring option that ships tonight beats the correct option that ships next month.*

### #1 — JSONL event log, not Postgres
The blueprint (§2.3, §6.3) specifies a Postgres `session_events` append-only table. M0 writes one `events.jsonl` file per room instead. Same invariants hold: monotonic `(room_id, seq)`, append **before** fan-out, the log *is* the observability system. The write path is isolated in `server/log.ts` so the swap to Postgres in M1 is one file, not a refactor.

### #2 — `ops.*` operator channel (M0 extension)
The blueprint has no operator; the kernel drives everything. In Wizard-of-Oz M0 the human *is* the Pacer/CTA/ICA, so we added an `ops.*` message namespace and a second WebSocket (`/ws/ops/:id`). These types are additive — no `c.*`/`s.*` contract shape changed — so when the agents come online (M1–M3) the operator channel simply becomes a supervisor view.

### #3 — Vanilla PWA + static hosting, not Next.js 15
The blueprint calls for Next.js 15 (Module 3). M0 ships hand-written HTML/CSS/JS served as static files by the room engine itself. Reason: two `npm install` trees and a build step add minutes to every container spin-up and buy nothing for a 6-player LAN room. The PWA contract (installable, service worker, offline shell) is fully met. Migration path: the `public/play` and `public/ops` client logic is small and framework-free, portable into a Next app when SSR/routing actually earns its weight.

### #4 — HMAC compact tickets, not JWT
`server/tickets.ts` issues `v1.<room>.<uid>.<exp>.<hmac>` signed with a per-deployment secret. Same security property as a JWT (server-signed, expiring, room+uid-bound) with zero dependencies. Verified once at WS `c.hello` and invisible thereafter — "trust, silent."

### #5 — Snapshot on every commit, not event-sourced reducers
The blueprint hydrates cold restarts from `snapshot + event replay` (§2.2.1). M0 writes a full state snapshot after **every** committed event (atomic tmp+rename). At ~1500 events / 5 KB per 90-minute room this is negligible, and it makes restart a single `readSnapshot()` with no reducer to get wrong. Replay still exists (`RoomLog.replay`) and powers **client** rejoin (seq > last_seq); it's just not on the server's own restart path in M0.

### #6 — Web Speech API device TTS, not ElevenLabs
Rawi's lines are spoken by the elected SPEAKER device via the browser `speechSynthesis` API. No audio pipeline, no keys, no latency budget to blow. Captions are always on (accessibility + the real signal); audio is the garnish. M2 swaps in the real TTS pipeline behind the same `s.host_say` contract.

### #7 — SVG manifest icon
One `icon.svg` with `purpose: "any maskable"` covers every install size, no PNG rasterization step.

### #8 — AGPL-3.0
Per the project's OSS/autonomy overlay: copyleft that survives the network-service loophole.

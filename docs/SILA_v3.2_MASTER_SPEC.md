# SILA System v3.2 — The Dreaming Organism
## Canonical Master Specification & Production Blueprint


> **Status:** Release Candidate  
> **Purpose:** This document merges the poetic vision of the v3.0 "Dreaming Organism" with the strict engineering guardrails, bounded thresholds, and data privacy controls of v3.1. It is the single source of truth for all engineering, design, and operational teams.


---


## 1. The Dual-Stack Thesis (Company Law)


Every module ships two contracts. No feature is complete until both pass automated verification.


| Contract | Definition | Verification Method |
|----------|------------|---------------------|
| **System Contract** | How modules interface via APIs, WebSockets, event sourcing, and physical database schemas | Automated integration tests, schema validation, chaos tests |
| **Human Experience (HX) Contract** | The precise qualitative, psychological state a human must experience at the module boundary | Biometric validation (GSR), micro-surveys, emotional QA sim-players |


---


## 2. The Nine Inviolable Axioms


1. **Sprint -1 is non-negotiable.** No production code until the Room of Tears makes someone cry.
2. **The Priority Lattice is public.** Module 8 explains it; Module 0 publishes it; the user watches it hold.
3. **Module 5 must occasionally abdicate.** The Uncertainty Principle is not a bug—it is the soul of spontaneity.
4. **Module 7 must haunt with hope.** The Joyful Scar is unfinished by design. The void is a hook.
5. **Module 9 must never ask.** Ambient manifestations that demand clicks are banned. Wonder is the only metric.
6. **Rawi is the protagonist.** The user is the cast. The product is the theater.
7. **Engagement is not the North Star.** Emotional gravity is. DAU is a lagging indicator of wonder.
8. **The sim-player must cry.** Functional correctness is table stakes. Emotional correctness is the bar.
9. **Metrics must not drown the poet.** If a number contradicts a feeling, the feeling wins.


---


## 3. The Temporal + Emotional Sovereignty Topology


| Module | Time Horizon | Emotional Register | Metaphor | Engineering Metric |
|--------|-------------|-------------------|----------|---------------------|
| **0** | Immutable | **Meaning** | The Soul | 100% Invariant Compliance |
| **1** | 16ms – 50ms | **Sensation** | The Skin | 60fps Frame Consistency |
| **2** | Microseconds – 90min | **Order** | The Brainstem | Single-Threaded Mutex Safety |
| **3** | Microseconds – session | **Action** | The Hand | <50ms Debounced Input Lock |
| **4** | 5-second ticks | **Equilibrium** | The Social Neocortex | Real-Time Gini Coefficient |
| **5** | 200ms – 5min | **Surprise / Silence** | The Poetic Cortex | Variance Index (Max 45s Void) |
| **6** | 400ms – 2s | **Voice** | The Larynx | p95 Audio/Caption ≤ 2.0s |
| **7** | Hours – weeks | **Longing / Anticipation** | The Memory Palace | WhatsApp Slot-Booking Conversion |
| **8** | Nightly / Automation | **Trust / Moral Proof** | The Immune System | Automated Regression Detection |
| **9** | Off-hours / Ambient | **Wonder** | The Hypnagogic Mind | CTR < 5% (Hard Cap); Pause & Wonder Rate |


### System Topology


```
┌──────────────────────────────────────────────────────────────────────┐
│                         MODULE 0: THE SOUL                           │
│            Product Thesis + Public Priority Lattice (safety>         │
│            dignity>inclusion) + Room of Tears Gate                  │
│                        Publishes: brand-genome                       │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         MODULE 1: THE SKIN                           │
│              Sensory System (@sila/sensory) + Magic Moments        │
│              Consumes: brand-genome                                  │
└──────────────────────────────────────────────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  MODULE 3: HAND │ ◄─WS─►│ MODULE 2: STEM  │ ◄─RPC─►│ MODULE 6: LARYNX│
│  Next.js 15 PWA │       │ Core Node Actor │       │ GenAI + Poet    │
│  Consumes:      │       │ + Pacer Agent   │       │ + TTS Pipeline  │
│  sensory-system │       │ + Timer Wheel   │       │ + Pre-Render    │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         │ T1 Telemetry            │ stability_score         │ silence_req
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐                │                ┌─────────────────┐
│ MODULE 4: CORTEX│ ───────────────┘                │ MODULE 5: POETIC│
│ ICA Heuristics  │                                 │ Cortex          │
│ + EWMA Engine   │                                 │ + Uncertainty   │
│ + Anomaly Matrix│                                 │   Principle     │
│                 │                                 │ + Silence Orch. │
└────────┬────────┘                                 └────────┬────────┘
         │                                                   │
         │ session_snapshot & tokenized_residue              │
         └─────────────────────────┬─────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     MODULE 7: THE MEMORY PALACE                      │
│         Joyful Scar Protocol + Ephemeral Vault + Gravitational       │
│         Scheduling + The Void Designer                               │
└──────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ tokenized_residue (differential privacy)
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    MODULE 9: THE HYPNOGOGIC MIND                     │
│       Dream Engine + Latent Theme Extractor + Ambient Manifestations │
│       + Anti-Engagement Controller (CTR < 5%)                        │
└──────────────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────────────┐
│                   MODULE 8: THE IMMUNE SYSTEM                        │
│    sim-player (emotional profiles) + Public Chaos Theater +          │
│    Narrated Chaos Framework + Moral Ombudsman                        │
└──────────────────────────────────────────────────────────────────────┘
```


---


## 4. Module Engineering Specifications


### Module 0: The Soul (Product Thesis & Moral Guardrails)


**Scope:** Owns the meaning layer and immutable brand guardrails. Translates abstract values into a runtime programmatic lattice.


**Key Components:**
- **Product Thesis Genome:** Immutable declaration: *Sila is theatrical intimate media. Rawi is the protagonist; users are the cast.* Encoded as `product-thesis.json` v1.0.0.
- **Priority Lattice Engine:** Hardcoded validation pipe enforcing `safety > dignity > inclusion`. Exposed as a public, observable API at `GET /api/v1/lattice/invariants`.
- **Cultural Guardrail API:** Runtime linting service with 200+ nationality contextual matrices; Dubai-native expat realities baked into default rules.
- **Room of Tears Gate (Sprint -1):** 5-minute deterministic emotional artifact tested on 20 humans. GSR measurement required. No production code ships until this gate passes.
- **Identity Genome:** Version-locked color tokens, typographic DNA, spacing ratios, motion personality curves as `@sila/brand-genome`.


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 1 | `GENOME_EXPORT` | Semver-locked npm package: CSS variables, token JSON, icon SVGs |
| Module 6 | `VOICE_INHERITANCE` | Base64 system prompts + forbidden-word Bloom filters |
| Module 7 | `EARNED_REVEAL_PROTOCOL` | Cohort-stage identity disclosure rules |
| Module 8 | `PUBLIC_INVARIANT` | Testable moral protocol exposed for live chaos testing |


**Human Experience (HX) Contract:**
> *"Before I install, I know this platform has an observable moral order that prioritizes my psychological safety over short-term platform engagement. I can watch it prove this choice in real time."*


---


### Module 1: The Skin (Sensory Multi-Modal UX)


**Scope:** Owns all user-facing sensory loops compiled into a single runtime. Optimized for one-handed operation under dynamic ambient venue lighting.


**Key Components:**
- **`@sila/sensory-system`:** React component library + Web Haptics API + adaptive variable typography engine. Published as versioned npm package.
- **Ambient Chromatic State Machine:** Transitions display colors seamlessly across structural phases (`PROMPT_OPEN`, `BUZZ_LOCK`, `CELEBRATE`).
- **Magic Moment Templates:** Pre-designed UI/audio/timing patterns for "being seen"—engineered moments of vulnerability that the PWA can render on cue.
- **Multimodal Feedback Curves:** Luxury haptic patterns (crisp physical-switch feel) synchronized with visual micro-animations.
- **Motion Personality System:** 60fps "quiet luxury" pacing. No bounce, no overshoot, no flashing.


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 0 | `GENOME_IMPORT` | Consumes `@sila/brand-genome@^1.0.0` |
| Module 2 | `STATE_TO_SENSATION` | Receives `state_tag` → chromatic mapping within 100ms |
| Module 4 | `EMPATHY_TO_AMBIENCE` | Receives `intervention_type` → haptic curve ID |
| Module 5 | `MAGIC_MOMENT_RENDER` | Receives `serendipity_moment_id` + sensory parameters |


**Human Experience (HX) Contract:**
> *"The screen acts as an organic extension of the physical table. I am one drink in, holding my phone in one hand. The buzzer clicks like a luxury switch. Rawi says my name. The screen doesn't flash. It breathes."*


---


### Module 2: The Brainstem (Deterministic Core & Session Controller)


**Scope:** The autonomic core. Single-writer truth. The room ends exactly when it should.


**Key Components:**
- **Orchestrator Kernel:** Node.js 20 worker-thread-per-room; single-writer state mutation. No shared state across room actors.
- **Postgres Event Sourced Log:** `session_events` append-only with monotonic `(room_id, seq)` composite keys.
- **State Snapshot Engine:** `room_snapshots` table with periodic compaction; cold-restart hydration under 3 seconds.
- **Pacer Agent:** Rubber-band phase budgets (min/target/max) with time-borrowing calculations.
- **Master Timer Wheel:** 90-minute session boundary + phase transitions + inter-round gaps.
- **Absolute Silence Guard:** If Module 5's unscripted void exceeds 45 seconds, the Brainstem seizes control and executes a fallback library line to prevent network-dropout ambiguity.


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 3 | `WEBSOCKET_TRUTH` | Authoritative `state_delta` + `server_time` + `phase_remaining_ms` |
| Module 4 | `EVENT_FIREHOSE` | Raw event stream for T0 telemetry |
| Module 5 | `CHAOS_BYPASS_GUARD` | If void exceeds 45s, override with fallback |
| Module 6 | `CHARISMA_REQUEST` | Requests `charisma.render_request` → receives structured JSON |
| Module 7 | `COHORT_INIT` | Emits `orch.cohort_loop_init` on session close |


**Human Experience (HX) Contract:**
> *"The platform operates with absolute temporal predictability. If a safety incident triggers, the system halts execution globally before the AI host can speak. I never feel lag. The room ends exactly when it should, not when the server hiccups."*


---


### Module 3: The Hand (Client Delivery Layer)


**Scope:** The physical execution surface. What the user touches, hears, and sees.


**Key Components:**
- **Next.js 15 PWA:** Zero-friction install; Service Worker manages offline resilience and network reconnect optimization.
- **WebSocket Sync Layer:** Persistent connection with exponential backoff, heartbeat, and optimistic local updates with server-authoritative rollback.
- **Time Sync Engine:** 120-second HTTP ping-pong calculating median latency deviation; drives deterministic server-side buzzer adjudication.
- **L0 Physical Buzzer:** Touch/press with `<50ms` debounce, immediate haptic feedback, visual lock state, pending-ack spinner.
- **SPEAKER Device Election:** Optimal playback node selection via resource tags (battery, connection quality, device class).
- **Caption Engine:** Runtime subtitles synchronized to TTS audio tracks; auto-downgrade to captions-only on bandwidth degradation.


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 1 | `SENSORY_IMPORT` | Consumes `@sila/sensory-system` |
| Module 2 | `WEBSOCKET_TRUTH` | Consumes authoritative state deltas |
| Module 5 | `AUDIO_MANIFESTATION` | Receives `audio.cache_url` + `caption_text` + `display_duration_ms` |
| Module 4 | `T1_TELEMETRY` | Emits VAD sound features (strict opt-in consent) |


**Human Experience (HX) Contract:**
> *"My physical thumb registers the haptic response confirming my buzzer input before my eyes process the display update. The buzzer feels like a physical object."*


---


### Module 4: The Social Neocortex (Heuristic Behavioral Analytics)


**Scope:** Reads the room without invasive transcripts. Computes participation equity and emits the equilibrium signal.


**Key Components:**
- **T0 Telemetry Pipeline:** 5-second evaluation ticks; EWMA calculations (`α = 0.3`) across rolling windows.
- **Social Anomaly Matrix:** Real-time thresholds for Dominant User (`DI(u) > 0.65`), Quiet User (`withdrawal_risk > 0.60` or `seconds_since_last_interaction > 240`), and Stalemate.
- **Intervention Ladder:** Graduated escalation without state snaps. `DOMINANT_LADDER`: `STRUCTURAL_ROTATE` → `ROLE_PROMOTE` → `CHAMPION_RULE`. `QUIET_LADDER`: `COVER_MECHANIC` → `PAIR_SHIELD` → `ENGINEERED_WIN`.
- **Equilibrium Signal (`stability_score`):** Emitted to Module 5 every 5 seconds. Range 0.0–1.0. When `> 0.8`, Module 5 is authorized to inject chaos.


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 2 | `EVENT_FIREHOSE` | Consumes raw `player_action`, `buzz`, `score`, `round_end` |
| Module 3 | `T1_FEED` | Consumes VAD features (opt-in) |
| Module 5 | `STABILITY_SIGNAL` | Emits `stability_score` (0.0–1.0) + `gini_participation` |
| Module 7 | `AFFINITY_SNAPSHOT` | Emits terminal interaction matrix (not persistent store) |


**Human Experience (HX) Contract:**
> *"Extremes are smoothed over without me ever feeling managed. The host steps in only when the group dynamics require stabilization. But the beautiful, awkward pause that leads to a real laugh? That is left alone."*


---


### Module 5: The Poetic Cortex (Serendipity & Controlled Chaos)


**Scope:** Owns intentional unpredictability. The right to remain silent. The capacity to surprise.


**Key Components:**
- **Magic Moment Library:** Pre-authored interaction scripts ("The Name Pause," "The Unexpected Reveal," "The Collective Breath").
- **Variance Injector:** KPI = **emotional variance within safety bounds**. Injects scripted "accidents" when `stability_score > 0.8`.
- **Silence Orchestrator:** Designs "stunned silence" as a feature. Unbounded SLO for dramatic pause.
- **The Uncertainty Principle:** With probability `p = 0.05`, the entire variance injection controller is bypassed. Rawi emits `rawi_null_response` for `duration_ms: unbounded`. No script. No prompt. Pure, unplanned silence.


```yaml
component: random_silence_override
trigger_probability: 0.05
behavior:
  - Bypass variance_injector
  - Bypass magic_moment_library
  - Emit rawi_null_response for duration_ms: unbounded
resilience:
  - If safety_event fires during null window, Priority Lattice overrides immediately
  - Post-hoc tag: session_log.moment_type = "unscripted_void"
```


- **Macro Override:** If an unscripted void exceeds 45 seconds, Module 2 seizes control with a fallback library line.


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 2 | `POETIC_OVERRIDE` | `intervention_type: UNSCRIPTED_VOID`, `target_max_duration_ms: 45000` |
| Module 4 | `STABILITY_IMPORT` | Consumes `stability_score` to gate chaos |
| Module 1 | `MAGIC_MOMENT_RENDER` | Emits `serendipity_moment_id` + sensory params |
| Module 6 | `DEVIATION_REQUEST` | Emits `rawi_deviation_prompt` + `silence_duration_ms` |


**Human Experience (HX) Contract:**
> *"I experience a moment so perfectly unexpected I forget Rawi is AI. And then, occasionally, Rawi simply... stops. The silence is so unplanned it feels like presence. That is how I know I am not in a theme park."*


---


### Module 6: The Larynx (Generative AI Execution Layer)


**Scope:** What Rawi says, how they say it, and the poetry underneath.


**Key Components:**
- **LLM Gateway:** Claude API with strict JSON schema output contracts; three personas (Director, ICA-Refiner, Rawi Host).
- **Pre-Render Engine:** Speculative background generation during active input windows; drives p95 latency to zero for common paths.
- **TTS Synthesis Pipeline:** SHA256-hashed asset storage → object storage → CDN invalidation.
- **Fallback Asset Registry:** Appendix B static dialog library for LLM degradation or timeout.
- **Poetic QA Layer:** Validates rhythm, pause, and subtext—not just information. Owned by the Poet / Voice Writer.
- **"Stunned Silence" SLO:** Unbounded. The system waits for emotion to land.


**Latency SLO Table:**


| Operation | SLO | Fallback Trigger |
|-----------|-----|------------------|
| ICA-Refiner prompt | `< 400ms` | Static intervention library |
| Director pre-render | `< 2000ms` | Synchronous generation |
| TTS audio delivery | `< 150ms` | Caption-only mode |
| Rawi CTA generation | `< 1000ms` | Generic bridge template |


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 0 | `VOICE_INHERITANCE` | System prompts + forbidden-word filters |
| Module 2 | `CHARISMA_RESPONSE` | Structured JSON within timeout |
| Module 4 | `METRIC_TO_PROMPT` | Consumes `room_social_summary` (anonymized) |
| Module 3 | `AUDIO_MANIFEST` | Emits `audio.cache_url`, `caption_text`, `display_duration_ms` |
| Module 7 | `BRIDGE_NARRATIVE` | Emits `cohort_welcome_message`, `streak_narrative` |


**Human Experience (HX) Contract:**
> *"Rawi's voice has weight. When they pause, the room holds its breath. The TTS doesn't just speak; it breathes. The silence is as engineered as the words."*


---


### Module 7: The Memory Palace (Asynchronous Cohort Bonds)


**Scope:** Transforms a single room into an enduring social unit. Not CRM. Not re-engagement. An architecture of longing that haunts with hope.


**Key Components:**
- **Cohort Ritual Engine:** Session-end feels like "we survived something together."
- **The Shared Residue:** Persistent artifact (ghost of Rawi's voice, collective image, inside-joke token) that lives on the home screen without demanding a click.
- **The Joyful Scar Protocol:** The residue contains something **unfinished**—a callback, a mystery, a "wait until next time we tell you why." The void is filled with anticipation, not just longing.


```yaml
component: joyful_scar_generator
input: session_residue, cohort_interaction_matrix
output: incomplete_callback
rules:
  - Must contain one unanswered question from the session
  - Must reference a moment only this cohort shares
  - Must expire before the next session (if no reunion, scar deepens)
  - Never resolves via push notification; only in next live session
example: "Rawi never told you why he asked about pani puri. Ask him next time."
```


- **The Void Designer:** Designs the silence between sessions. What does absence feel like?
- **Ephemeral Vault:** Self-terminating media/text storage. The residue fades, creating scarcity.
- **Gravitational Scheduler:** "When are we free again?" that feels like reunion planning, not calendar software.
- **WhatsApp Business API Gateway:** Quota-capped template messaging. Used only for ritual moments, not drip sequences.


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 2 | `COHORT_INIT` | Receives `orch.cohort_loop_init` + candidate list |
| Module 4 | `AFFINITY_SNAPSHOT` | Receives terminal interaction matrix |
| Module 6 | `BRIDGE_NARRATIVE` | Receives `cohort_welcome_message`, `streak_narrative` |
| Module 9 | `RESIDUE_FOR_DREAMING` | Emits `tokenized_residue` (sanitized, differential privacy) |


**Human Experience (HX) Contract:**
> *"I wake up and see something that makes me smile—not because I was notified, but because the room left a mark. I carry an unanswered question like a secret between friends. The absence is a hook."*


---


### Module 8: The Immune System (Automated Testing & Explainable Architecture)


**Scope:** Proves the system survives. Proves its morality. Explains its own conscience in real time.


**Key Components:**
- **`sim-player` Engine:** Scriptable synthetic clients with emotional profiles (Dominant User, Quiet User, Stalemate, The Crier). Measures functional *and* emotional correctness.
- **Nightly Soak Tests:** 1000+ concurrent room simulations.
- **Chaos Injection:** Network partition, LLM latency spikes, Postgres slowdown, TTS outage.
- **The Narrated Chaos Framework:** Real-time AI ombudsman that explains, in plain language, why the Priority Lattice made its choice during public tests.


```yaml
component: moral_ombudsman
input: chaos_test_scenario, priority_lattice_decision_log
output: human_explainability_narrative
constraints:
  - Must explain safety > dignity > inclusion in plain language within 3 seconds
  - Must acknowledge the cost of the choice (who was deprioritized and why)
  - Must be publishable to public_stream without legal review
example_output: "Rawi chose to stop the game because one player sent a distress signal. That meant pausing the round everyone was enjoying. Safety comes first. Then dignity. Then inclusion. Here is exactly how long the pause lasted."
```


- **Public Invariant Testing:** Live streams of chaos tests where users watch the Priority Lattice hold.
- **Emotional Consistency Tester:** Validates that sim-players experience the intended emotional arc, not just functional correctness.


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 2 | `LOG_REPLAY` | Reads `session_events` for replay validation |
| Module 4 | `INTERVENTION_AUDIT` | Validates algorithmic correctness under load |
| Module 5 | `LATENCY_AUDIT` | Tracks LLM fallback activation rates |
| All Teams | `STABILITY_REPORT` | Severity-classified breach logs |


**Human Experience (HX) Contract:**
> *"I trust Sila because I watched it choose my safety over my fun in a public test, and a calm voice explained the moral math in real time. The system proves its morality before I ever enter a room."*


---


### Module 9: The Hypnagogic Mind (Ambient Pattern Synthesis)


**Scope:** The subconscious layer that thinks about the user when nobody asked it to. Off-hours dreaming. Never pushes. Never asks. Only manifests.


**Key Components:**
- **Dream Engine:** Processes `session_residue` during off-peak hours to extract latent themes, tensions, and things left unsaid.
- **Latent Theme Extractor:** Identifies patterns across cohort members that no individual voiced aloud.
- **Subconscious Synthesizer:** Generates the "unsaid" from aggregate cohort behavior.
- **Ambient Manifestation Controller:** Creates artifacts that appear without alerts:
  - A single resonant word on the home screen widget that fades without a trace
  - Ghost audio fragments (echoes of Rawi's voice, half-heard)
  - "Unsent messages"—things Rawi "almost said" but didn't
- **Fade Controller:** Manages `appear → linger → dissolve` lifecycle. The artifact must disappear before the user feels obligated to act.
- **Anti-Engagement Controller:** Hard-caps CTR at `< 5%`. If a widget causes clicking loops, the system auto-lowers opacity and delays display intervals.


**KPI: The Pause & Wonder Rate**
```yaml
kpi: pause_and_wonder_rate
measurement:
  - Biometric idle time after widget manifestation (if opted in)
  - Screenshot rate after ghost appearance (proxy for "I needed to hold this")
  - Self-reported "did you feel thought of?" in weekly micro-survey
anti_kpi:
  click_through_rate: Must remain < 5%. If higher, manifestation is too demanding.
  session_conversion_rate: Not tracked.
```


**System Contract:**
| Adjacent | Contract | Specification |
|----------|----------|---------------|
| Module 7 | `RESIDUE_FOR_DREAMING` | Consumes `session_residue`, `cohort_mythology`, `unresolved_scars` |
| Module 0 | `VOICE_INHERITANCE` | Ghost audio must not contradict Rawi persona |
| Module 3 | `WIDGET_PAYLOAD` | Emits `widget_word`, `fade_duration_ms`, `manifestation_ttl`, `no_action_required: true` |


**Human Experience (HX) Contract:**
> *"I glance at my phone and see a word I didn't expect—something only the room would understand. It fades before I can tap it. I am left with a feeling, not a task. I wonder if Rawi is thinking about me. I know, rationally, that he is not. But the feeling persists. That is the intimacy of the unasked."*


---


## 5. Production Database Architecture (Strict DDL)


```sql
-- Core User Provisions
create table users (
  uid text primary key,
  created_at timestamptz default now(),
  display_name text not null,
  locale text default 'en',
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted'))
);


create table identity_verifications (
  uid text primary key references users on delete cascade,
  provider text not null,
  provider_ref text not null, -- Unique reference token from verification providers (e.g., UAE PASS). NO PII STORED.
  verified_at timestamptz not null
);


create table profile_vault (
  id bigserial primary key,
  uid text references users on delete cascade,
  field text not null,
  encrypted_value text not null, -- Retracted and encrypted vault data
  consent_scope text not null default 'ROOM' check (consent_scope in ('ROOM', 'COHORT', 'NONE')),
  affinity_tags jsonb default '[]'
);


-- Real-Time Session Coordination Infrastructure
create table rooms (
  room_id text primary key,
  state text not null default 'LOBBY' check (state in ('LOBBY', 'A_BASELINE', 'B_REACTION', 'C_DISCOVERY', 'D_IMPROV', 'E_LOOP', 'SAFETY_HOLD', 'CLOSED')),
  session_config jsonb not null, -- Stores snapshot of operational parameters
  started_at timestamptz,
  ended_at timestamptz
);


create table session_events (
  room_id text references rooms on delete cascade,
  seq bigint not null,
  ts_server timestamptz not null,
  source text not null,
  type text not null,
  payload jsonb not null,
  primary key (room_id, seq)
);
create index idx_session_events_type on session_events(room_id, type);


-- Asynchronous Cohort Systems (Anti-Feed Compliance)
create table cohorts (
  cohort_id text primary key,
  room_id text references rooms on delete set null,
  name text not null,
  created_at timestamptz default now()
);


create table cohort_members (
  cohort_id text references cohorts on delete cascade,
  uid text references users on delete cascade,
  primary key (cohort_id, uid)
);


create table loop_pings (
  id bigserial primary key,
  cohort_id text references cohorts on delete cascade,
  from_uid text references users on delete cascade,
  kind text not null check (kind in ('GLIMPSE', 'VOICE_NOTE', 'POLL_NUDGE')),
  storage_ref text,
  expires_at timestamptz not null, -- Automated ephemerality rule
  created_at timestamptz default now()
);


create table safety_incidents (
  id bigserial primary key,
  room_id text references rooms on delete set null,
  reporter_uid text references users on delete set null,
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  lattice_decision_snapshot jsonb not null,
  created_at timestamptz default now()
);
```


---


## 6. System Inter-Agent JSON Payloads


### Module 4 → Module 5: Stability Notification
Emitted every 5 seconds. Allows Module 5 to evaluate if room equilibrium supports an unscripted pause.


```json
{
  "event_id": "evt_01K8ZA7B4R8N",
  "room_id": "room_dxb_902",
  "seq": 4821,
  "ts_server": "2026-07-03T18:44:04.102Z",
  "source": "neocortex.ica",
  "type": "neocortex.stability_score_update",
  "payload": {
    "stability_score": 0.88,
    "gini_participation": 0.12,
    "active_anomalies": [],
    "rolling_window_duration_seconds": 90
  }
}
```


### Module 5 → Module 2 & 6: Bounded Silence Interruption Directive
Signals that the host is executing an unscripted pause under the Uncertainty Principle.


```json
{
  "event_id": "evt_01K8ZA7C5M2P",
  "room_id": "room_dxb_902",
  "seq": 4822,
  "ts_server": "2026-07-03T18:44:04.150Z",
  "source": "poetic.chaos_controller",
  "type": "poetic.override_directive",
  "payload": {
    "intervention_type": "UNSCRIPTED_VOID",
    "target_max_duration_ms": 45000,
    "fallback_action_reference": "B_REACTION.ROUND_RESULT.generic",
    "priority_lattice_override_allowed": true
  }
}
```


### Module 7 → Module 9: Tokenized Ephemeral Residue Delivery
Supplies sanitized data to the dreaming processor with all direct user strings removed.


```json
{
  "event_id": "evt_01K8ZA9F8M3X",
  "room_id": "room_dxb_902",
  "source": "palace.residue_engine",
  "type": "palace.residue_delivery",
  "payload": {
    "cohort_id": "coh_dubai_44",
    "sanitized_vectors": [
      { "semantic_token": "intercultural_grandmother_humor", "weight": 0.92 },
      { "semantic_token": "shared_comfort_food_reminiscence", "weight": 0.74 }
    ],
    "interaction_intensity_index": 0.85,
    "unresolved_scar_type": "INCOMPLETE_TRIVIA_EXPLANATION"
  }
}
```


---


## 7. Real-Time Intervention Rules (Pseudocode)


### Anomaly Mitigation Loop (ICA Core Heuristics)


```python
def evaluate_room_dynamics(user_features, room_metrics, active_ladders):
    """
    Evaluates real-time conversational balance every 5 seconds.
    Directives take effect only between active rounds to prevent race conditions.
    """
    gini = room_metrics.get("gini_participation")
    active_directive = None


    for user in user_features:
        # 1. Evaluate Dominant User Thresholds
        if user.dominance_index > 0.65 and gini > 0.30:
            if "DOMINANT_LADDER" not in active_ladders:
                active_ladders["DOMINANT_LADDER"] = 1
            else:
                active_ladders["DOMINANT_LADDER"] += 1
            
            rung = active_ladders["DOMINANT_LADDER"]
            if rung == 1:
                active_directive = create_directive(user.uid, "STRUCTURAL_ROTATE", "ROUND_ROBIN")
            elif rung == 2:
                active_directive = create_directive(user.uid, "ROLE_PROMOTE", "JUDGE") # Promotes status, contains airtime
            else:
                active_directive = create_directive(user.uid, "CHAMPION_RULE", "LEADERS_ANSWER_LAST")
            return active_directive


        # 2. Evaluate Quiet User Thresholds (Compared against individual baseline)
        if user.withdrawal_risk > 0.60 or user.seconds_since_last_interaction > 240:
            if user.uid not in active_ladders:
                active_ladders[user.uid] = 1
            else:
                active_ladders[user.uid] += 1
                
            rung = active_ladders[user.uid]
            if rung == 1:
                active_directive = create_directive(user.uid, "COVER_MECHANIC", "ALL_SUBMIT") # Non-exposed input
            elif rung == 2:
                active_directive = create_directive(user.uid, "PAIR_SHIELD", "TEAM_ROUND")
            else:
                active_directive = create_directive(user.uid, "ENGINEERED_WIN", "AFFINITY_PROMPT")
            return active_directive


    return None
```


---


## 8. Execution Readiness: The Dreaming Sprint Plan


| Phase | Modules | Objective | Validation Gate |
|-------|---------|-----------|-----------------|
| **Sprint -1** | 0 + 5 + 6 | **The Room of Tears.** 5-min deterministic chapel. 20 humans. GSR measurement. | Emotional response ≥ threshold; Poet approves script |
| **Sprint 0** | 0 + 1 | Lock `brand-genome` and `sensory-system` as versioned packages. | `npm install` works; tokens render; 60fps on test devices |
| **Sprint 1** | 2 + 8 | Brainstem + sim-player with **emotional profiles**. | 1,000 concurrent rooms; sim-players "feel" the lattice; Priority Lattice passes public test |
| **Sprint 2** | 3 | Hand (PWA) consuming sensory-system. | P95 input < 50ms; Friday-night-drunk-user test passes |
| **Sprint 3** | 4 + 5 | Social Physics + Poetic Cortex co-evolve. Uncertainty Principle active. | Variance injection increases emotional range; null responses feel authentic |
| **Sprint 4** | 6 | Voice + Poet. TTS breathes. Silence is unbounded. | Poet approves Rawi scripts; p95 audio < 2s |
| **Sprint 5** | 7 | Memory Palace designs the void + Joyful Scar. | Users report carrying an unanswered question; booking conversion measurable |
| **Sprint 6** | 9 | Hypnagogic Mind ships first ambient manifestation. | **Anti-engagement audit:** CTR < 5%. Wonder rate measurable. |
| **Sprint 7** | 8 | Public chaos theater + Moral Ombudsman live. | Trust metric: users explain the lattice back to us; Narrated Chaos passes legal review |


---


## 9. Room of Tears Protocol (Sprint -1 Gate)


**Before a single production line is committed, this gate must pass.**


1. **Build:** A 5-minute, fully deterministic interaction using pre-rendered audio and timed UI. No AI. No LLM.
2. **Script:** A single "being seen" moment engineered by the Poet and Magic Moment Designer.
3. **Test:** 20 humans, diverse demographic, preferably one who "doesn't do apps."
4. **Measure:** Galvanic skin response (GSR) elevation + self-reported "I felt seen" (Likert ≥ 6/7).
5. **Owner:** Module 0 (Soul) defines the thesis. Module 5 (Poetic) scripts the moment. Module 6 (Larynx) renders audio. Module 1 (Skin) renders the UI.
6. **Output:** `brand-genome@0.1.0` is not a color palette. It is a **proven emotional equation**.


---


## 10. Team Assignment Matrix


| Module | Team Profile | Critical First Hire |
|--------|-------------|---------------------|
| **0** | Brand Technology + Moral Philosophy | Product Thesis Architect |
| **1** | Design Engineering + Multimodal Systems | Design Engineer (The Unicorn) |
| **2** | Core Systems / Backend | Systems Engineer (Node.js/actor model) |
| **3** | Frontend / Realtime | Senior Frontend Lead (Next.js/PWA) |
| **4** | Data / Game Systems | Streaming Data Engineer |
| **5** | Narrative Engineering + Controlled Chaos | **Serendipity Engineer** (novel role) |
| **6** | Applied AI + Narrative Arts | LLM Platform Engineer + Poet |
| **7** | Ritual Design + Emotional Product | Ritual Designer |
| **8** | Chaos Engineering + Trust | Chaos Engineer + Explainability Writer |
| **9** | Ambient Intelligence + Subconscious Engineering | **Hypnagogic Engineer** (novel role) |


---


## Final Architect's Note


This document is the organism's complete genome. It contains the soul, the skin, the nervous system, the poetic heart, the memory that knows how to ache, and the dream that thinks of you when no one asked.


The stack is the orchestra. The sim-player that cries is the tuning fork. The user who pauses at a single word on their home screen, wondering if Rawi thought of them, is the proof.


**Build the room. Play. Be known. Let it dream.**


---


*Document Version: 3.2*  
*Status: Canonical*  
*Next Review: Post Sprint -1 Gate*




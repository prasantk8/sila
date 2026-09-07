/**
 * SILA M0 — Normative contracts.
 * Transcribed from SILA_Invisible_Host_Architecture_v1.md §2.3 (event envelope,
 * RoomState, WS contract) and §3 (state machine). Where M0 extends the contract
 * (operator channel), types are namespaced `ops.*` / `m0.*` and logged in
 * docs/DECISIONS.md.
 */

// ---------------------------------------------------------------- states

export const MASTER_STATES = [
  "LOBBY",
  "A_BASELINE",
  "B_REACTION",
  "C_DISCOVERY",
  "D_IMPROV",
  "E_LOOP",
  "CLOSED",
] as const;
export type MasterState = (typeof MASTER_STATES)[number];

/** Orthogonal interrupts (§3.8) are flags/overlays, not positions in the line. */
export type OrthogonalState = "SAFETY_HOLD" | "PAUSED" | "CANCELLED_GRACEFUL";

export const MICRO_STATES = [
  "IDLE",
  "ROUND_INTRO",
  "PROMPT_OPEN",
  "BUZZ_LOCK",
  "ADJUDICATE",
  "CELEBRATE",
  "INTERSTITIAL",
] as const;
export type MicroState = (typeof MICRO_STATES)[number];

export type Mechanic =
  | "OPEN_BUZZ"
  | "ALL_TAP"
  | "ALL_SUBMIT"
  | "SPEED_SORT"
  | "WHOSE_IS_THIS"
  | "TWO_TRUTHS_TABLE"
  | "GUESS_ORIGIN"
  | "STORY_CHAIN"
  | "PITCH_OFF"
  | "SOUND_ONLY";

export type ConnState = "CONNECTED" | "LAGGING" | "DROPPED" | "LEFT";

// ---------------------------------------------------------------- envelope

/** §2.3 — every internal message uses this envelope; appended to the log BEFORE fan-out. */
export interface EventEnvelope<P = Record<string, unknown>> {
  event_id: string;
  room_id: string;
  seq: number;
  ts_server: string; // ISO-8601
  source: string; // "orch" | "pacer" | "chemistry" | "ops" | "client:<uid>" | ...
  type: string;
  causality?: string[];
  payload: P;
}

// ---------------------------------------------------------------- room state

export interface ParticipantLive {
  participation_share: number;
  initiative: number;
  median_buzz_ms: number | null;
  success_rate: number;
  withdrawal_risk: number;
  dominance_index: number;
  silence_baseline: number | null;
}

export interface Participant {
  uid: string;
  display: string;
  conn: ConnState;
  device_role: "SPEAKER" | "MEMBER";
  device_caps: { audio_out: boolean; battery: number | null; net: string | null };
  rtt_ms: number | null; // server-measured EWMA (WS ping/pong)
  score: number;
  rounds_eligible: number;
  reveals_unlocked: string[];
  affinity_tags: string[];
  live: ParticipantLive;
  last_interaction_ts: number | null;
  human_followup: boolean;
}

export interface Moment {
  seq: number;
  kind: "BIG_LAUGH" | "PHOTO_FINISH" | "CALLBACK_WORTHY" | "OPERATOR_TAGGED";
  tag: string;
  phrase_hint: string;
  participants: string[];
}

export interface ActiveRound {
  round_no: number;
  pack_id: string;
  prompt_id: string;
  mechanic: Mechanic;
  body: unknown;
  answer_key?: unknown;
  targeting: { mode: "OPEN" | "TARGETED" | "ROUND_ROBIN"; target_uid: string | null };
  opened_at: string;
  timer_s: number;
  locks: { uid: string; t_adj_ms: number; t_recv_ms: number }[];
  taps: Record<string, number>; // ALL_TAP: uid -> choice index
  submissions: Record<string, string>; // ALL_SUBMIT: uid -> text (never fanned out attributed)
  winner_uid: string | null;
  photo_finish: boolean;
  eligible_uids: string[]; // CONNECTED at open (§3.4 drop rule)
}

export interface RoomClock {
  t_start: string | null;
  t_elapsed_s: number;
  phase_elapsed_s: number;
  phase_budget_s: { min: number; target: number; max: number };
  session_hard_stop_s: number;
  paused_ms_total: number;
}

export interface RoomState {
  room_id: string;
  state_version: number;
  master_state: MasterState;
  micro_state: MicroState;
  clock: RoomClock;
  participants: Participant[];
  room_metrics: {
    energy: number;
    gini_participation: number;
    silence_run_ms: number;
    laughter_events_5m: number;
    prompt_engagement_last: number | null;
  };
  active_round: ActiveRound | null;
  active_directive: {
    directive_id: string;
    intervention: string;
    target_uid: string | null;
    note: string;
    expires_after_events: number;
  } | null;
  moments: Moment[];
  reveal_grants: { about_uid: string; field: string; value: string; earned_by_prompt_id: string | null }[];
  flags: { degraded_mode: boolean; safety_hold: boolean; paused: boolean; cancelled: boolean };
  objectives: {
    baselines_captured: number;
    rounds_played: number;
    users_with_highlight: string[];
    reveal_grants_count: number;
    group_laugh_moments: number;
    improv_sets_completed: number;
    loop_artifacts_emitted: boolean;
  };
  cohort_seed: {
    name: string | null;
    name_suggestions: Record<string, string>;
    top_moments: number[];
    poll: { slots: string[]; votes: Record<string, number>; winning_slot: string | null } | null;
  };
}

// ---------------------------------------------------------------- client → server (§2.3, verbatim types)

export type ClientMsg =
  | { type: "c.hello"; uid: string; room_ticket: string; display?: string; last_seq?: number; device_caps?: Participant["device_caps"] }
  | { type: "c.time_ping"; t0_client: number }
  | { type: "c.buzz"; prompt_id: string; t_client: number }
  | { type: "c.answer"; prompt_id: string; value: string | number }
  | { type: "c.react"; emoji_code: string }
  | { type: "c.leave_discreet" }
  | { type: "c.safety"; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" };

// ---------------------------------------------------------------- server → client (§2.3)

export type ServerMsg =
  | { type: "s.hello_ack"; uid: string; seq: number }
  | { type: "s.time_pong"; t0: number; t1_server: number }
  | { type: "s.state_sync"; seq: number; state: unknown } // RoomState-lite projection
  | { type: "s.prompt"; seq: number; prompt_id: string; mechanic: Mechanic; body: unknown; media?: unknown; targeting: ActiveRound["targeting"]; timer_s: number }
  | { type: "s.buzz_lock"; seq: number; prompt_id: string; holder_uid: string }
  | { type: "s.buzz_result"; seq: number; winner_uid: string | null; order: string[]; photo_finish: boolean }
  | { type: "s.score"; seq: number; deltas: { uid: string; delta: number }[]; totals: { uid: string; score: number }[] }
  | { type: "s.host_say"; seq: number; line_id: string; text: string; captions: true; audio: { mode: "device_tts" | "none"; cache_url?: string }; speaker_device_uid: string | null; est_s: number }
  | { type: "s.role_assign"; seq: number; uid: string; role: "JUDGE" | "READER" | "CAPTAIN"; round_scope: number }
  | { type: "s.reveal_grant"; seq: number; about_uid: string; field: string; value: string; earned_by_prompt_id: string | null }
  | { type: "s.phase"; seq: number; master_state: MasterState; micro_state: MicroState }
  | { type: "s.tap_tally"; seq: number; prompt_id: string; tally: number[]; total: number }
  | { type: "s.hold"; seq: number; on: boolean }
  | { type: "s.pause"; seq: number; on: boolean }
  | { type: "s.send_off"; seq: number; cohort_name: string | null; winning_slot: string | null; top_moments: { tag: string; phrase_hint: string }[] }
  | { type: "s.error"; code: string; detail?: string };

// ---------------------------------------------------------------- operator channel (M0 extension — DECISIONS #2)

export type OpsMsg =
  | { type: "ops.hello"; ops_key: string }
  | { type: "ops.state_transition"; to: MasterState; force?: boolean; reason?: string }
  | { type: "ops.round_open"; pack_id: string; prompt_id: string; targeting?: ActiveRound["targeting"]; timer_s?: number }
  | { type: "ops.round_lock_now" }
  | { type: "ops.adjudicate"; correct: boolean; winner_uid?: string | null }
  | { type: "ops.round_scrap"; reason: string } // flopped prompt → RESCUE path
  | { type: "ops.host_say"; line_key?: string; text?: string; slots?: Record<string, string>; est_s?: number }
  | { type: "ops.reveal_grant"; about_uid: string; field: string; value: string }
  | { type: "ops.role_assign"; uid: string; role: "JUDGE" | "READER" | "CAPTAIN" }
  | { type: "ops.moment_tag"; kind: Moment["kind"]; tag: string; phrase_hint: string; participants: string[] }
  | { type: "ops.directive_set"; intervention: string; target_uid: string | null; note: string }
  | { type: "ops.directive_clear" }
  | { type: "ops.hold"; on: boolean; reason?: string }
  | { type: "ops.pause"; on: boolean; reason?: string }
  | { type: "ops.cancel_graceful"; reason: string }
  | { type: "ops.poll_open"; slots: string[] }
  | { type: "ops.poll_close" }
  | { type: "ops.christen"; name: string }
  | { type: "ops.close_room" }
  | { type: "ops.speaker_elect"; uid: string | null };

export interface OpsView {
  state: RoomState;
  warnings: string[];
  submissions_pending: { uid: string; display: string; value: string }[] | null;
  last_events: EventEnvelope[];
}

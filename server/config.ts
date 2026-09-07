/**
 * Appendix A — `session_config` defaults (tunables).
 * Reading contract rule 2: these are config values, never hardcode.
 * Every room snapshot-copies this object into its own state at creation,
 * so mid-flight rooms are immune to config edits.
 */

export interface SessionConfig {
  phase_budgets_min: Record<string, [number, number, number]>;
  session_hard_stop_min: number;
  buzz: { lock_ms: number; tie_window_ms: number };
  conn: { lagging_ms: number; dropped_ms: number; rejoin_replay_max: number };
  ica: {
    tick_s: number;
    window_s: number;
    ewma_alpha: number;
    dominance: { trigger: number; release: number; gini_gate: number };
    withdrawal: { trigger: number; zero_interaction_min: number };
    stalemate_s: { afterglow: number; discussion: number; interstitial: number };
    budgets: { room_active_directives: number; per_user_per_phase: number };
    callback_min_gap_s: number;
  };
  cta: { timeout_ms: number; line_max_s_default: number; prerender_top_k: number };
  director: { timeout_ms: number; min_confidence: number };
  loop: { ping_quota_week: number; voice_note_max_s: number; poll_slots: number };
  laugh_proxy: { reacts_min: number; window_ms: number };
  lobby: { min_present_to_start: number; start_grace_min: number };
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  phase_budgets_min: {
    A: [6, 8, 10],
    B: [15, 20, 25],
    C: [20, 30, 35],
    D: [15, 20, 22],
    E: [8, 10, 12],
  },
  session_hard_stop_min: 95,
  buzz: { lock_ms: 150, tie_window_ms: 30 },
  conn: { lagging_ms: 1500, dropped_ms: 10000, rejoin_replay_max: 50 },
  ica: {
    tick_s: 5,
    window_s: 90,
    ewma_alpha: 0.3,
    dominance: { trigger: 0.65, release: 0.55, gini_gate: 0.3 },
    withdrawal: { trigger: 0.6, zero_interaction_min: 4 },
    stalemate_s: { afterglow: 20, discussion: 12, interstitial: 8 },
    budgets: { room_active_directives: 1, per_user_per_phase: 2 },
    callback_min_gap_s: 300,
  },
  cta: { timeout_ms: 2000, line_max_s_default: 8, prerender_top_k: 3 },
  director: { timeout_ms: 1500, min_confidence: 0.6 },
  loop: { ping_quota_week: 3, voice_note_max_s: 15, poll_slots: 3 },
  laugh_proxy: { reacts_min: 3, window_ms: 3000 },
  lobby: { min_present_to_start: 4, start_grace_min: 10 },
};

/** Map master state letter → budget key. */
export function phaseKey(state: string): string | null {
  const m = state.match(/^([ABCDE])_/);
  return m ? m[1] : null;
}

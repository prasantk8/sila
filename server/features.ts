/**
 * T0 telemetry — "the mechanics are the sensor" (§1.5).
 *
 * Everything here is computed from explicit in-game inputs (buzz, answer,
 * react, taps). No audio, no content inspection. M0's exit criterion includes
 * "event corpus collected to tune §4 thresholds" — these live numbers are that
 * corpus, surfaced on the Operator Console and written into room outcome.
 *
 * In M0 these figures are *telemetry for the human operator*, not an autonomous
 * ICA. The directive loop stays human (§6.6 M0 → M3 seam).
 */

import type { Participant, RoomState } from "./contracts.js";

interface InteractionSample {
  uid: string;
  t: number;
  kind: "buzz" | "answer" | "react" | "tap" | "submit";
}

export class T0Features {
  private samples: InteractionSample[] = [];
  private buzzLatencies = new Map<string, number[]>(); // uid -> ms samples
  private attempts = new Map<string, number>();
  private wins = new Map<string, number>();
  private opportunities = 0;
  private reactTimestamps: number[] = [];

  record(kind: InteractionSample["kind"], uid: string, t = Date.now()): void {
    this.samples.push({ uid, t, kind });
    if (kind === "react") this.reactTimestamps.push(t);
    // keep a rolling 10-minute buffer; windows below slice it
    const cutoff = t - 10 * 60_000;
    if (this.samples.length > 4000) this.samples = this.samples.filter((s) => s.t >= cutoff);
    this.reactTimestamps = this.reactTimestamps.filter((x) => x >= cutoff);
  }

  recordBuzzLatency(uid: string, latencyMs: number): void {
    const arr = this.buzzLatencies.get(uid) ?? [];
    arr.push(latencyMs);
    if (arr.length > 50) arr.shift();
    this.buzzLatencies.set(uid, arr);
  }

  recordAttempt(uid: string): void {
    this.attempts.set(uid, (this.attempts.get(uid) ?? 0) + 1);
  }
  recordWin(uid: string): void {
    this.wins.set(uid, (this.wins.get(uid) ?? 0) + 1);
  }
  recordOpportunity(): void {
    this.opportunities++;
  }

  /** §4.1 laugh_proxy (T0): ≥N reacts within window → treat as a group laugh. */
  laughProxyFired(reactsMin: number, windowMs: number, now = Date.now()): boolean {
    const recent = this.reactTimestamps.filter((t) => now - t <= windowMs);
    return recent.length >= reactsMin;
  }

  medianBuzzMs(uid: string): number | null {
    const arr = this.buzzLatencies.get(uid);
    if (!arr || arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /** Interaction share over a rolling window (§4.1 participation_share). */
  shares(uids: string[], windowS: number, now = Date.now()): Map<string, number> {
    const cutoff = now - windowS * 1000;
    const counts = new Map<string, number>(uids.map((u) => [u, 0]));
    let total = 0;
    for (const s of this.samples) {
      if (s.t < cutoff || !counts.has(s.uid)) continue;
      counts.set(s.uid, (counts.get(s.uid) ?? 0) + 1);
      total++;
    }
    const out = new Map<string, number>();
    for (const u of uids) out.set(u, total > 0 ? (counts.get(u) ?? 0) / total : 0);
    return out;
  }

  initiative(uid: string): number {
    if (this.opportunities === 0) return 0;
    return Math.min(1, (this.attempts.get(uid) ?? 0) / this.opportunities);
  }

  successRate(uid: string): number {
    const a = this.attempts.get(uid) ?? 0;
    return a === 0 ? 0 : (this.wins.get(uid) ?? 0) / a;
  }

  secondsSinceLast(uid: string, now = Date.now()): number | null {
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].uid === uid) return (now - this.samples[i].t) / 1000;
    }
    return null;
  }

  /** Refresh the `live` block on every participant + room gini/energy. */
  applyTo(state: RoomState, windowS: number, now = Date.now()): void {
    const active = state.participants.filter((p) => p.conn !== "LEFT");
    const uids = active.map((p) => p.uid);
    const shares = this.shares(uids, windowS, now);
    for (const p of active) {
      p.live.participation_share = round3(shares.get(p.uid) ?? 0);
      p.live.initiative = round3(this.initiative(p.uid));
      p.live.success_rate = round3(this.successRate(p.uid));
      p.live.median_buzz_ms = this.medianBuzzMs(p.uid);
    }
    state.room_metrics.gini_participation = round3(gini(active.map((p) => p.live.participation_share)));
    // energy: z-blend proxy — interaction density over the last 60 s, squashed
    const cutoff = now - 60_000;
    const density = this.samples.filter((s) => s.t >= cutoff).length / Math.max(1, active.length);
    state.room_metrics.energy = round3(Math.min(1, density / 8));
  }
}

/** Gini coefficient over participation shares — the balance north star (§4.1). */
export function gini(values: number[]): number {
  const xs = values.filter((v) => v >= 0);
  const n = xs.length;
  if (n === 0) return 0;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (i + 1) * sorted[i];
  return round3((2 * cum) / (n * sum) - (n + 1) / n);
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function scorePct(p: Participant): number {
  return p.rounds_eligible === 0 ? 0 : Math.round((p.score / p.rounds_eligible) * 10) / 10;
}

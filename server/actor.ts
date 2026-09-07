/**
 * RoomActor — one room = one actor (§1.3).
 *
 * Single writer of RoomState. Every input (client message, operator command,
 * timer tick) is funneled through one serialized queue; the actor is the only
 * code that mutates state. Events are committed to the append-only log BEFORE
 * fan-out (§2.3). Horizontal scale = more actors, never shared state.
 *
 * M0 scope (§6.6): the deterministic L0 reflex path (buzz lock, adjudication,
 * scores, connection lifecycle, safety hold) is real; session FLOW is driven
 * by the human operator through `ops.*` commands. The seams where the Pacer
 * (M1), CTA (M2) and ICA directive loop (M3) take over are marked `SEAM:`.
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ActiveRound,
  ClientMsg,
  EventEnvelope,
  MasterState,
  Mechanic,
  MicroState,
  Moment,
  OpsMsg,
  OpsView,
  Participant,
  RoomState,
  ServerMsg,
} from "./contracts.js";
import { MASTER_STATES } from "./contracts.js";
import { DEFAULT_SESSION_CONFIG, phaseKey, type SessionConfig } from "./config.js";
import { RoomLog } from "./log.js";
import { T0Features, scorePct } from "./features.js";
import { ContentStore, estimateSeconds } from "./lines.js";

// ---------------------------------------------------------------- transport

export interface ClientPort {
  uid: string;
  send(msg: ServerMsg): void;
  isOpen(): boolean;
  close(): void;
  rttMs(): number | null; // server-measured (WS ping/pong EWMA)
}

export interface OpsPort {
  send(view: OpsView): void;
  isOpen(): boolean;
}

type Command =
  | { kind: "client"; uid: string; msg: ClientMsg; t_recv_ms: number }
  | { kind: "ops"; msg: OpsMsg }
  | { kind: "tick" }
  | { kind: "attach"; port: ClientPort; last_seq: number }
  | { kind: "detach"; uid: string }
  | { kind: "internal"; fn: () => Promise<void> };

const BUZZ_MECHANICS: Mechanic[] = ["OPEN_BUZZ", "WHOSE_IS_THIS", "GUESS_ORIGIN", "TWO_TRUTHS_TABLE"];
const TAP_MECHANICS: Mechanic[] = ["ALL_TAP", "SPEED_SORT"];
const SUBMIT_MECHANICS: Mechanic[] = ["ALL_SUBMIT"];
const STAGE_MECHANICS: Mechanic[] = ["STORY_CHAIN", "PITCH_OFF", "SOUND_ONLY"];

export class RoomActor {
  readonly roomId: string;
  readonly config: SessionConfig;
  state: RoomState;
  private log: RoomLog;
  private content: ContentStore;
  private dataRoot: string;

  private queue: Command[] = [];
  private draining = false;

  private ports = new Map<string, ClientPort>();
  private opsPorts = new Set<OpsPort>();
  private lastPongAt = new Map<string, number>();
  private vault = new Map<string, Record<string, string>>(); // uid -> consented facts (never fanned to clients)

  private features = new T0Features();
  private buzzTimer: NodeJS.Timeout | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private phaseStartedAt = 0; // wall ms, adjusted for pauses
  private pausedAt: number | null = null;
  private lastHostLine: { msg: Extract<ServerMsg, { type: "s.host_say" }>; at: number } | null = null;
  private lastInteractionAt = Date.now();
  private lastLaughMomentAt = 0;
  private warnings: string[] = [];
  private interventionCount = new Map<string, number>(); // per-user per-phase budget (§4.2)

  constructor(roomId: string, dataRoot: string, content: ContentStore, config?: SessionConfig, restored?: RoomState) {
    this.roomId = roomId;
    this.dataRoot = dataRoot;
    this.content = content;
    this.config = config ?? structuredClone(DEFAULT_SESSION_CONFIG);
    this.log = new RoomLog(dataRoot, roomId);
    this.state = restored ?? this.freshState();
  }

  private freshState(): RoomState {
    const [min, target, max] = [0, 0, this.config.lobby.start_grace_min];
    return {
      room_id: this.roomId,
      state_version: 0,
      master_state: "LOBBY",
      micro_state: "IDLE",
      clock: {
        t_start: null,
        t_elapsed_s: 0,
        phase_elapsed_s: 0,
        phase_budget_s: { min: min * 60, target: target * 60, max: max * 60 },
        session_hard_stop_s: this.config.session_hard_stop_min * 60,
        paused_ms_total: 0,
      },
      participants: [],
      room_metrics: { energy: 0, gini_participation: 0, silence_run_ms: 0, laughter_events_5m: 0, prompt_engagement_last: null },
      active_round: null,
      active_directive: null,
      moments: [],
      reveal_grants: [],
      flags: { degraded_mode: false, safety_hold: false, paused: false, cancelled: false },
      objectives: {
        baselines_captured: 0,
        rounds_played: 0,
        users_with_highlight: [],
        reveal_grants_count: 0,
        group_laugh_moments: 0,
        improv_sets_completed: 0,
        loop_artifacts_emitted: false,
      },
      cohort_seed: { name: null, name_suggestions: {}, top_moments: [], poll: null },
    };
  }

  async init(): Promise<void> {
    await this.log.init();
    this.phaseStartedAt = Date.now();
    this.tickTimer = setInterval(() => this.enqueue({ kind: "tick" }), 1000);
  }

  async shutdown(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.buzzTimer) clearTimeout(this.buzzTimer);
  }

  // -------------------------------------------------------------- queue (single-writer guarantee)

  enqueue(cmd: Command): void {
    this.queue.push(cmd);
    if (!this.draining) void this.drain();
  }

  private async drain(): Promise<void> {
    this.draining = true;
    while (this.queue.length > 0) {
      const cmd = this.queue.shift()!;
      try {
        await this.handle(cmd);
      } catch (err) {
        console.error(`[${this.roomId}] command error`, cmd.kind, err);
        this.warn(`internal error handling ${cmd.kind}: ${(err as Error).message}`);
      }
    }
    this.draining = false;
  }

  private async handle(cmd: Command): Promise<void> {
    switch (cmd.kind) {
      case "attach": return this.onAttach(cmd.port, cmd.last_seq);
      case "detach": return this.onDetach(cmd.uid);
      case "client": return this.onClient(cmd.uid, cmd.msg, cmd.t_recv_ms);
      case "ops": return this.onOps(cmd.msg);
      case "tick": return this.onTick();
      case "internal": return cmd.fn();
    }
  }

  // -------------------------------------------------------------- commit + fan-out (log BEFORE fan-out)

  private async commit(source: string, type: string, payload: Record<string, unknown>, causality?: string[]): Promise<EventEnvelope> {
    const evt: EventEnvelope = {
      event_id: `evt_${randomUUID().slice(0, 12)}`,
      room_id: this.roomId,
      seq: this.state.state_version + 1,
      ts_server: new Date().toISOString(),
      source,
      type,
      ...(causality ? { causality } : {}),
      payload,
    };
    await this.log.append(evt); // the log is the truth; nothing leaves before this resolves
    this.state.state_version = evt.seq;
    await this.log.writeSnapshot(evt.seq, this.state); // M0 restore strategy — DECISIONS #5
    return evt;
  }

  /** Commit a client-visible message (type `s.*`) and fan it out. */
  private async fan(msg: Record<string, unknown> & { type: string }, only?: string[]): Promise<EventEnvelope> {
    const { type, ...payload } = msg;
    const evt = await this.commit("orch", type, payload);
    const wire = { ...msg, seq: evt.seq } as ServerMsg;
    for (const [uid, port] of this.ports) {
      if (only && !only.includes(uid)) continue;
      if (port.isOpen()) port.send(wire);
    }
    return evt;
  }

  private pushOpsView(): void {
    const view = this.buildOpsView();
    for (const p of this.opsPorts) if (p.isOpen()) p.send(view);
  }

  // -------------------------------------------------------------- membership / connection

  addOpsPort(p: OpsPort): void {
    this.opsPorts.add(p);
    p.send(this.buildOpsView());
  }
  removeOpsPort(p: OpsPort): void {
    this.opsPorts.delete(p);
  }

  /** REST join (LOBBY): reserve a seat, store consented vault facts. */
  join(display: string, affinity_tags: string[], vaultFacts: Record<string, string>): { uid: string } | { error: string } {
    const seated = this.state.participants.filter((p) => p.conn !== "LEFT").length;
    if (this.state.master_state === "CLOSED") return { error: "room_closed" };
    if (seated >= 6) return { error: "room_full" };
    const uid = "u_" + display.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) + "_" + randomUUID().slice(0, 4);
    const participant: Participant = {
      uid,
      display: display.slice(0, 24),
      conn: "DROPPED",
      device_role: "MEMBER",
      device_caps: { audio_out: false, battery: null, net: null },
      rtt_ms: null,
      score: 0,
      rounds_eligible: 0,
      reveals_unlocked: [],
      affinity_tags: affinity_tags.slice(0, 8),
      live: { participation_share: 0, initiative: 0, median_buzz_ms: null, success_rate: 0, withdrawal_risk: 0, dominance_index: 0, silence_baseline: null },
      last_interaction_ts: null,
      human_followup: false,
    };
    this.state.participants.push(participant);
    this.vault.set(uid, vaultFacts);
    this.enqueue({ kind: "internal", fn: async () => { await this.commit("orch", "orch.member_reserved", { uid, display: participant.display }); this.pushOpsView(); } });
    return { uid };
  }

  private async onAttach(port: ClientPort, last_seq: number): Promise<void> {
    const p = this.participant(port.uid);
    if (!p) { port.send({ type: "s.error", code: "unknown_uid" }); port.close(); return; }
    const existing = this.ports.get(port.uid);
    if (existing && existing !== port) existing.close();
    this.ports.set(port.uid, port);
    this.lastPongAt.set(port.uid, Date.now());
    const wasDropped = p.conn === "DROPPED" || p.conn === "LAGGING";
    p.conn = "CONNECTED";
    await this.commit("orch", "orch.conn", { uid: port.uid, conn: "CONNECTED", rejoin: wasDropped });
    port.send({ type: "s.hello_ack", uid: port.uid, seq: this.state.state_version });

    // §6.3 reconnect: state_sync + replay seq > last_seq capped at rejoin_replay_max, else snapshot only
    const replayable = last_seq > 0 ? await this.log.replay(last_seq) : [];
    const clientEvents = replayable.filter((e) => e.type.startsWith("s."));
    port.send({ type: "s.state_sync", seq: this.state.state_version, state: this.projectClient() });
    if (clientEvents.length > 0 && clientEvents.length <= this.config.conn.rejoin_replay_max) {
      for (const e of clientEvents) {
        if (e.type === "s.state_sync") continue;
        port.send({ ...(e.payload as object), type: e.type, seq: e.seq } as ServerMsg);
      }
    }
    this.electSpeaker();
    this.pushOpsView();
  }

  private async onDetach(uid: string): Promise<void> {
    const p = this.participant(uid);
    this.ports.delete(uid);
    if (!p || p.conn === "LEFT") return;
    // socket gone — LAGGING now; DROPPED after conn.dropped_ms via tick audit
    if (p.conn === "CONNECTED") {
      p.conn = "LAGGING";
      await this.commit("orch", "orch.conn", { uid, conn: "LAGGING" });
      this.pushOpsView();
    }
  }

  notePong(uid: string): void {
    this.lastPongAt.set(uid, Date.now());
  }

  private participant(uid: string): Participant | undefined {
    return this.state.participants.find((p) => p.uid === uid);
  }

  private activeParticipants(): Participant[] {
    return this.state.participants.filter((p) => p.conn !== "LEFT");
  }

  /** §2.3 audio topology: elect ONE speaker device. Priority: audio_out > net > battery. */
  private electSpeaker(): void {
    const candidates = this.activeParticipants().filter((p) => p.conn === "CONNECTED");
    const score = (p: Participant) =>
      (p.device_caps.audio_out ? 4 : 0) +
      (p.device_caps.net === "good" ? 2 : p.device_caps.net === "ok" ? 1 : 0) +
      (p.device_caps.battery ?? 0.5);
    const best = candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
    let changed = false;
    for (const p of this.state.participants) {
      const role = best && p.uid === best.uid ? "SPEAKER" : "MEMBER";
      if (p.device_role !== role) { p.device_role = role; changed = true; }
    }
    if (changed && best) {
      // on speaker loss: if last line < 5 s old, replay from cache on the new speaker (§2.3)
      if (this.lastHostLine && Date.now() - this.lastHostLine.at < 5000) {
        const port = this.ports.get(best.uid);
        if (port?.isOpen()) port.send({ ...this.lastHostLine.msg, speaker_device_uid: best.uid });
      }
      this.enqueue({ kind: "internal", fn: async () => { await this.commit("orch", "orch.speaker_elected", { uid: best.uid }); this.pushOpsView(); } });
    }
  }

  // -------------------------------------------------------------- client messages

  private async onClient(uid: string, msg: ClientMsg, t_recv_ms: number): Promise<void> {
    const p = this.participant(uid);
    if (!p) return;

    switch (msg.type) {
      case "c.time_ping": {
        // replied at transport level for latency; nothing to commit
        return;
      }
      case "c.buzz": return this.onBuzz(p, msg.prompt_id, t_recv_ms);
      case "c.answer": return this.onAnswer(p, msg.prompt_id, msg.value);
      case "c.react": return this.onReact(p, msg.emoji_code);
      case "c.leave_discreet": return this.onLeaveDiscreet(p);
      case "c.safety": return this.onSafety(p, msg.severity);
      default:
        return;
    }
  }

  // ---- L0 buzz path (§2.3 buzz fairness; §3.2 BUZZ_LOCK)

  private async onBuzz(p: Participant, prompt_id: string, t_recv_ms: number): Promise<void> {
    const r = this.state.active_round;
    if (this.state.flags.safety_hold || this.state.flags.paused) return;
    if (!r || r.prompt_id !== prompt_id || !BUZZ_MECHANICS.includes(r.mechanic)) return;
    if (!r.eligible_uids.includes(p.uid)) return; // DROPPED at open → excluded from this adjudication (§3.4)
    if (r.targeting.mode === "TARGETED" && r.targeting.target_uid && r.targeting.target_uid !== p.uid) return;

    const micro = this.state.micro_state;
    if (micro !== "PROMPT_OPEN" && micro !== "BUZZ_LOCK") {
      const port = this.ports.get(p.uid);
      if (port?.isOpen()) port.send({ type: "s.error", code: "buzz_locked" });
      return;
    }
    if (r.locks.some((l) => l.uid === p.uid)) return; // one buzz per user per round

    // authoritative order = t_server_receive − rtt/2 (§2.3)
    const rtt = this.ports.get(p.uid)?.rttMs() ?? p.rtt_ms ?? 0;
    p.rtt_ms = rtt;
    const t_adj_ms = t_recv_ms - rtt / 2;
    r.locks.push({ uid: p.uid, t_adj_ms, t_recv_ms });
    this.features.record("buzz", p.uid, t_recv_ms);
    this.features.recordAttempt(p.uid);
    this.features.recordBuzzLatency(p.uid, Math.max(0, t_adj_ms - Date.parse(r.opened_at)));
    p.last_interaction_ts = t_recv_ms;
    this.lastInteractionAt = t_recv_ms;

    if (micro === "PROMPT_OPEN") {
      // first valid buzz: freeze the table within lock_ms — broadcast immediately
      this.state.micro_state = "BUZZ_LOCK";
      await this.fan({ type: "s.buzz_lock", prompt_id, holder_uid: p.uid });
      // collection window: lock_ms of wall clock so RTT compensation can reorder arrivals
      this.buzzTimer = setTimeout(() => {
        this.enqueue({ kind: "internal", fn: () => this.adjudicateBuzz(prompt_id) });
      }, this.config.buzz.lock_ms);
    }
    this.pushOpsView();
  }

  private async adjudicateBuzz(prompt_id: string): Promise<void> {
    const r = this.state.active_round;
    if (!r || r.prompt_id !== prompt_id || this.state.micro_state !== "BUZZ_LOCK") return;
    this.buzzTimer = null;

    const order = [...r.locks].sort((a, b) => a.t_adj_ms - b.t_adj_ms);
    const winner = order[0] ?? null;
    r.winner_uid = winner?.uid ?? null;
    r.photo_finish =
      order.length >= 2 && order[1].t_adj_ms - order[0].t_adj_ms <= this.config.buzz.tie_window_ms;

    this.state.micro_state = "ADJUDICATE";
    await this.fan({
      type: "s.buzz_result",
      winner_uid: r.winner_uid,
      order: order.map((l) => l.uid),
      photo_finish: r.photo_finish,
    });

    if (r.photo_finish && order.length >= 2) {
      // §2.3: ties are handed over as a *moment* — in M0, surfaced to the operator
      await this.tagMoment("PHOTO_FINISH", "photo_finish", `photo finish between ${this.name(order[0].uid)} and ${this.name(order[1].uid)}`, [order[0].uid, order[1].uid], "orch");
      this.warn(`PHOTO FINISH (Δ ${Math.round(order[1].t_adj_ms - order[0].t_adj_ms)} ms) — drama beat available`);
    }
    this.pushOpsView();
  }

  private async onAnswer(p: Participant, prompt_id: string, value: string | number): Promise<void> {
    const r = this.state.active_round;
    if (!r || r.prompt_id !== prompt_id || this.state.flags.safety_hold) return;
    this.features.record("answer", p.uid);
    p.last_interaction_ts = Date.now();
    this.lastInteractionAt = Date.now();

    if (SUBMIT_MECHANICS.includes(r.mechanic) && this.state.micro_state === "PROMPT_OPEN") {
      // private, unattributed to the room — zero-exposure participation (§3.3)
      r.submissions[p.uid] = String(value).slice(0, 120);
      this.features.record("submit", p.uid);
      if (this.state.master_state === "E_LOOP") this.state.cohort_seed.name_suggestions[p.uid] = String(value).slice(0, 40);
      await this.commit(`client:${p.uid}`, "orch.submission_received", { uid: p.uid }); // content NOT in the shared log line
      if (Object.keys(r.submissions).length >= this.eligibleConnected(r).length) await this.closeTapOrSubmit();
      this.pushOpsView();
      return;
    }

    if (TAP_MECHANICS.includes(r.mechanic) && this.state.micro_state === "PROMPT_OPEN") {
      const idx = Number(value);
      if (!Number.isInteger(idx)) return;
      r.taps[p.uid] = idx;
      this.features.record("tap", p.uid);
      await this.commit(`client:${p.uid}`, "orch.tap_received", { uid: p.uid, choice: idx });
      if (Object.keys(r.taps).length >= this.eligibleConnected(r).length) await this.closeTapOrSubmit();
      this.pushOpsView();
      return;
    }

    if (BUZZ_MECHANICS.includes(r.mechanic) && this.state.micro_state === "ADJUDICATE" && r.winner_uid === p.uid) {
      const key = r.answer_key as { correct_choice?: number; accept?: string[] } | undefined;
      await this.commit(`client:${p.uid}`, "orch.answer_given", { uid: p.uid, value: String(value).slice(0, 120) });
      if (key?.correct_choice !== undefined) {
        return this.resolveRound(Number(value) === key.correct_choice, p.uid);
      }
      if (key?.accept && key.accept.length > 0) {
        const norm = String(value).trim().toLowerCase();
        const hit = key.accept.some((a) => norm.includes(a.toLowerCase()));
        return this.resolveRound(hit, p.uid);
      }
      // no key → Wizard-of-Oz adjudication: operator rules via ops.adjudicate
      this.warn(`answer in from ${p.display}: "${String(value).slice(0, 80)}" — adjudicate on the console`);
      this.pushOpsView();
      return;
    }
  }

  private eligibleConnected(r: ActiveRound): Participant[] {
    return this.activeParticipants().filter((p) => r.eligible_uids.includes(p.uid) && p.conn === "CONNECTED");
  }

  private async onReact(p: Participant, emoji_code: string): Promise<void> {
    if (this.state.flags.safety_hold) return;
    this.features.record("react", p.uid);
    p.last_interaction_ts = Date.now();
    this.lastInteractionAt = Date.now();
    await this.commit(`client:${p.uid}`, "orch.react", { uid: p.uid, emoji_code: emoji_code.slice(0, 8) });
    // §4.1 laugh_proxy → §4.7 moment engine (auto-tag; operator refines the phrase_hint)
    const { reacts_min, window_ms } = this.config.laugh_proxy;
    if (this.features.laughProxyFired(reacts_min, window_ms) && Date.now() - this.lastLaughMomentAt > 30_000) {
      this.lastLaughMomentAt = Date.now();
      this.state.room_metrics.laughter_events_5m++;
      const tag = this.state.active_round ? `laugh_${this.state.active_round.prompt_id}` : "laugh_open_floor";
      const hint = this.state.active_round ? `the ${(this.state.active_round.body as { title?: string })?.title ?? "last"} round` : "an open-floor laugh";
      await this.tagMoment("BIG_LAUGH", tag, hint, this.activeParticipants().map((x) => x.uid), "chemistry");
    }
    this.pushOpsView();
  }

  private async onLeaveDiscreet(p: Participant): Promise<void> {
    p.conn = "LEFT";
    this.ports.get(p.uid)?.close();
    this.ports.delete(p.uid);
    await this.commit("orch", "orch.leave_discreet", { uid: p.uid });
    // CTA covers ONCE, then never mentions it again (§3.4) — M0: operator reminder
    this.warn(`${p.display} left discreetly — cover once (COVER_DISCONNECT line), then never mention`);
    this.electSpeaker();
    this.pushOpsView();
  }

  private async onSafety(p: Participant, severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): Promise<void> {
    // restricted-detail file, separate from the shareable event log (§3.8, §6.2 RLS intent)
    const incident = { at: new Date().toISOString(), reporter_uid: p.uid, severity };
    await fs.appendFile(path.join(this.dataRoot, "rooms", this.roomId, "safety.jsonl"), JSON.stringify(incident) + "\n");
    await this.commit("orch", "safety.incident", { severity }); // no reporter in the shared log
    if (severity === "HIGH" || severity === "CRITICAL") {
      await this.setHold(true, `player safety signal (${severity})`);
    } else {
      this.warn(`safety signal (${severity}) received — reporter details in safety.jsonl`);
    }
    this.pushOpsView();
  }

  private async setHold(on: boolean, reason: string): Promise<void> {
    if (this.state.flags.safety_hold === on) return;
    this.state.flags.safety_hold = on;
    if (on) {
      // freeze rounds; the host goes silent (§3.8)
      if (this.buzzTimer) { clearTimeout(this.buzzTimer); this.buzzTimer = null; }
      this.state.micro_state = "IDLE";
      this.state.active_round = null;
      this.pausedAt = this.pausedAt ?? Date.now();
    } else if (!this.state.flags.paused && this.pausedAt !== null) {
      this.state.clock.paused_ms_total += Date.now() - this.pausedAt;
      this.pausedAt = null;
    }
    await this.commit("orch", "safety.hold", { on, reason });
    await this.fan({ type: "s.hold", on });
  }

  // -------------------------------------------------------------- operator commands

  private async onOps(msg: OpsMsg): Promise<void> {
    if (this.state.flags.safety_hold && !["ops.hold", "ops.host_say", "ops.close_room"].includes(msg.type)) {
      this.warn("room is in SAFETY_HOLD — resume before other actions");
      this.pushOpsView();
      return;
    }
    switch (msg.type) {
      case "ops.state_transition": return this.opsTransition(msg.to, msg.force ?? false, msg.reason);
      case "ops.round_open": return this.opsRoundOpen(msg.pack_id, msg.prompt_id, msg.targeting, msg.timer_s);
      case "ops.round_lock_now": return this.closeTapOrSubmit(true);
      case "ops.adjudicate": return this.resolveRound(msg.correct, msg.winner_uid ?? this.state.active_round?.winner_uid ?? null);
      case "ops.round_scrap": return this.opsRoundScrap(msg.reason);
      case "ops.host_say": return this.opsHostSay(msg);
      case "ops.reveal_grant": return this.opsRevealGrant(msg.about_uid, msg.field, msg.value);
      case "ops.role_assign": return this.opsRoleAssign(msg.uid, msg.role);
      case "ops.moment_tag": return this.tagMoment(msg.kind, msg.tag, msg.phrase_hint, msg.participants, "ops");
      case "ops.directive_set": return this.opsDirectiveSet(msg.intervention, msg.target_uid, msg.note);
      case "ops.directive_clear": { this.state.active_directive = null; await this.commit("ops", "chemistry.directive_cleared", {}); this.pushOpsView(); return; }
      case "ops.hold": return this.setHold(msg.on, msg.reason ?? "operator");
      case "ops.pause": return this.opsPause(msg.on, msg.reason);
      case "ops.cancel_graceful": return this.opsCancelGraceful(msg.reason);
      case "ops.poll_open": return this.opsPollOpen(msg.slots);
      case "ops.poll_close": return this.opsPollClose();
      case "ops.christen": return this.opsChristen(msg.name);
      case "ops.speaker_elect": return this.opsSpeakerForce(msg.uid);
      case "ops.close_room": return this.opsCloseRoom();
      default: return;
    }
  }

  /** Phase gates (§3.1): linear order enforced; min-time guard unless force; force logged. */
  private async opsTransition(to: MasterState, force: boolean, reason?: string): Promise<void> {
    const from = this.state.master_state;
    const fromIdx = MASTER_STATES.indexOf(from);
    const toIdx = MASTER_STATES.indexOf(to);
    if (toIdx !== fromIdx + 1) { this.warn(`illegal transition ${from} → ${to} (linear order only)`); this.pushOpsView(); return; }

    if (from === "LOBBY") {
      const present = this.activeParticipants().filter((p) => p.conn === "CONNECTED").length;
      if (present < this.config.lobby.min_present_to_start && !force) {
        this.warn(`LOBBY gate: ${present} present < ${this.config.lobby.min_present_to_start}. Force to start anyway, or CANCELLED_GRACEFUL (§3.8).`);
        this.pushOpsView();
        return;
      }
      this.state.clock.t_start = new Date().toISOString();
    } else {
      const minS = this.state.clock.phase_budget_s.min;
      if (this.state.clock.phase_elapsed_s < minS && !force) {
        this.warn(`gate: ${from} at ${fmtMin(this.state.clock.phase_elapsed_s)} < min ${fmtMin(minS)} — force to override`);
        this.pushOpsView();
        return;
      }
    }
    if (to === "CLOSED" && !this.state.objectives.loop_artifacts_emitted && !force) {
      this.warn("E → CLOSED gate: loop artifacts not emitted (christen + poll close first), force to override");
      this.pushOpsView();
      return;
    }

    const objectives_snapshot = { ...this.state.objectives, users_with_highlight: this.state.objectives.users_with_highlight.length };
    const key = phaseKey(to);
    const budget = key ? this.config.phase_budgets_min[key] : null;
    this.state.master_state = to;
    this.state.micro_state = "IDLE";
    this.state.active_round = null;
    this.state.clock.phase_elapsed_s = 0;
    this.phaseStartedAt = Date.now();
    this.interventionCount.clear(); // per-phase budget reset (§4.2)
    this.state.clock.phase_budget_s = budget
      ? { min: budget[0] * 60, target: budget[1] * 60, max: budget[2] * 60 }
      : { min: 0, target: 0, max: 0 };

    await this.commit("orch", "orch.state_transition", {
      from, to,
      trigger: force ? "OPERATOR_FORCE" : "OPERATOR_PROPOSAL_ACCEPTED", // SEAM: M1 → PACER_PROPOSAL_ACCEPTED
      reason: reason ?? null,
      objectives_snapshot,
      phase_budget_next_s: this.state.clock.phase_budget_s,
    });
    await this.fan({ type: "s.phase", master_state: to, micro_state: "IDLE" });

    if (to === "CLOSED") await this.finalizeOutcome();
    this.pushOpsView();
  }

  private async opsRoundOpen(pack_id: string, prompt_id: string, targeting?: ActiveRound["targeting"], timer_s?: number): Promise<void> {
    if (this.state.flags.paused) { this.warn("room paused"); return; }
    const found = this.content.getPrompt(pack_id, prompt_id);
    if (!found) { this.warn(`unknown prompt ${pack_id}/${prompt_id}`); this.pushOpsView(); return; }
    const { pack, prompt } = found;
    if (this.state.micro_state === "PROMPT_OPEN" || this.state.micro_state === "BUZZ_LOCK") {
      this.warn("a round is already open — scrap or resolve it first");
      this.pushOpsView();
      return;
    }

    // INTERSTITIAL rule (§3.2): directives take effect only between rounds — consumed here.
    let tgt: ActiveRound["targeting"] = targeting ?? { mode: "OPEN", target_uid: null };
    const dir = this.state.active_directive;
    if (dir && dir.target_uid && !targeting) {
      tgt = { mode: "TARGETED", target_uid: dir.target_uid };
      this.warn(`directive "${dir.intervention}" applied: round targeted at ${this.name(dir.target_uid)}`);
    }

    const eligible = this.activeParticipants().filter((p) => p.conn === "CONNECTED").map((p) => p.uid);
    for (const uid of eligible) {
      const p = this.participant(uid);
      if (p) p.rounds_eligible++; // score_pct normalization (§3.4)
    }
    this.features.recordOpportunity();

    const round: ActiveRound = {
      round_no: this.state.objectives.rounds_played + 1,
      pack_id,
      prompt_id,
      mechanic: pack.mechanic,
      body: prompt.body,
      answer_key: prompt.answer_key,
      targeting: tgt,
      opened_at: new Date().toISOString(),
      timer_s: timer_s ?? pack.timer_s_default,
      locks: [],
      taps: {},
      submissions: {},
      winner_uid: null,
      photo_finish: false,
      eligible_uids: eligible,
    };
    this.state.active_round = round;
    this.state.micro_state = "PROMPT_OPEN";
    await this.commit("orch", "orch.round_open", { round_no: round.round_no, pack_id, prompt_id, mechanic: round.mechanic, targeting: tgt, eligible: eligible.length });

    // per-player cue distribution for stage mechanics (STORY_CHAIN etc.)
    const body = prompt.body as { cues?: string[] } & Record<string, unknown>;
    if (STAGE_MECHANICS.includes(round.mechanic) && Array.isArray(body.cues)) {
      const cues = body.cues;
      let i = 0;
      for (const uid of eligible) {
        const personal = { ...prompt.body, your_cue: cues[i % cues.length] };
        i++;
        const port = this.ports.get(uid);
        // personalized bodies are per-device; the committed s.prompt below carries the shared body
        if (port?.isOpen()) port.send({ type: "s.prompt", seq: this.state.state_version, prompt_id, mechanic: round.mechanic, body: personal, targeting: tgt, timer_s: round.timer_s });
      }
      await this.commit("orch", "s.prompt", { prompt_id, mechanic: round.mechanic, body: prompt.body, targeting: tgt, timer_s: round.timer_s, personalized: true });
    } else {
      await this.fan({ type: "s.prompt", prompt_id, mechanic: round.mechanic, body: prompt.body, targeting: tgt, timer_s: round.timer_s });
    }
    this.pushOpsView();
  }

  /** TAP/SUBMIT window close: timer expiry, everyone in, or operator's lock-now. */
  private async closeTapOrSubmit(byOps = false): Promise<void> {
    const r = this.state.active_round;
    if (!r || this.state.micro_state !== "PROMPT_OPEN") return;
    if (TAP_MECHANICS.includes(r.mechanic)) {
      const choices = ((r.body as { choices?: string[] }).choices ?? []).length || 2;
      const tally = new Array(choices).fill(0);
      for (const idx of Object.values(r.taps)) if (idx >= 0 && idx < choices) tally[idx]++;
      const total = Object.keys(r.taps).length;
      this.state.micro_state = "CELEBRATE";
      r.winner_uid = null;
      const engagement = r.eligible_uids.length ? total / r.eligible_uids.length : 0;
      this.state.room_metrics.prompt_engagement_last = round2(engagement);
      // ALL_TAP scoring: only when a key exists — otherwise zero-stakes by design (§4.6)
      const key = r.answer_key as { correct_choice?: number } | undefined;
      const deltas: { uid: string; delta: number }[] = [];
      if (key?.correct_choice !== undefined) {
        for (const [uid, idx] of Object.entries(r.taps)) {
          if (idx === key.correct_choice) {
            const p = this.participant(uid);
            if (p) { p.score += 5; deltas.push({ uid, delta: 5 }); this.features.recordWin(uid); this.markHighlight(uid); }
          }
        }
      }
      await this.fan({ type: "s.tap_tally", prompt_id: r.prompt_id, tally, total });
      if (deltas.length) await this.fanScore(deltas);
      await this.commit("orch", "orch.round_result", this.roundResultPayload(r, null, engagement));
      this.state.objectives.rounds_played++;
      this.afterRound(engagement);
    } else if (SUBMIT_MECHANICS.includes(r.mechanic)) {
      const total = Object.keys(r.submissions).length;
      const engagement = r.eligible_uids.length ? total / r.eligible_uids.length : 0;
      this.state.room_metrics.prompt_engagement_last = round2(engagement);
      this.state.micro_state = "ADJUDICATE"; // operator reads them aloud via Rawi, unattributed
      await this.commit("orch", "orch.submissions_closed", { count: total, engagement: round2(engagement) });
      if (this.state.master_state === "A_BASELINE") {
        this.state.objectives.baselines_captured = total;
        await this.commit("chemistry", "chemistry.baseline_report", { baselines_captured: total }); // SEAM: M3 fills real baselines
      }
      this.warn(`submissions closed (${total}) — read them through Rawi, then Adjudicate to move on`);
      if (byOps) this.pushOpsView();
    }
    this.pushOpsView();
  }

  /** Shared resolution for buzz rounds, stage sets and submit reads. */
  private async resolveRound(correct: boolean, winner_uid: string | null): Promise<void> {
    const r = this.state.active_round;
    if (!r) return;
    if (this.state.micro_state !== "ADJUDICATE" && this.state.micro_state !== "BUZZ_LOCK" && this.state.micro_state !== "PROMPT_OPEN") return;
    if (this.buzzTimer) { clearTimeout(this.buzzTimer); this.buzzTimer = null; }

    const deltas: { uid: string; delta: number }[] = [];
    if (winner_uid && correct) {
      const p = this.participant(winner_uid);
      if (p) {
        p.score += 10;
        deltas.push({ uid: winner_uid, delta: 10 });
        this.features.recordWin(winner_uid);
        this.markHighlight(winner_uid);
      }
    }
    const attempted = BUZZ_MECHANICS.includes(r.mechanic) ? r.locks.length : Object.keys(r.taps).length + Object.keys(r.submissions).length;
    const engagement = r.eligible_uids.length ? Math.min(1, attempted / r.eligible_uids.length) : 0;
    this.state.room_metrics.prompt_engagement_last = round2(engagement);

    if (STAGE_MECHANICS.includes(r.mechanic)) this.state.objectives.improv_sets_completed++;

    this.state.micro_state = "CELEBRATE";
    if (deltas.length) await this.fanScore(deltas);
    await this.commit("orch", "orch.round_result", this.roundResultPayload(r, correct ? winner_uid : null, engagement, correct));
    this.state.objectives.rounds_played++;
    this.afterRound(engagement);
    this.pushOpsView();
  }

  private roundResultPayload(r: ActiveRound, winner: string | null, engagement: number, correct?: boolean) {
    const dir = this.state.active_directive;
    let directive_satisfied: boolean | null = null;
    if (dir) {
      directive_satisfied = dir.target_uid ? winner === dir.target_uid : true;
      dir.expires_after_events--;
      if (directive_satisfied || dir.expires_after_events <= 0) this.state.active_directive = null;
    }
    return {
      prompt_id: r.prompt_id,
      mechanic: r.mechanic,
      winner_uid: winner,
      correct: correct ?? null,
      order: r.locks.sort((a, b) => a.t_adj_ms - b.t_adj_ms).map((l) => l.uid),
      photo_finish: r.photo_finish,
      score_deltas: winner ? [{ uid: winner, delta: 10 }] : [],
      engagement: round2(engagement),
      directive_satisfied,
    };
  }

  private afterRound(engagement: number): void {
    // flopped prompt (§3.4): mark for pack curation + RESCUE beat hint
    if (engagement < 0.3) {
      this.warn(`prompt flopped (engagement ${round2(engagement)}) — fire a RESCUE line, draw the next prompt from a different sub-pack`);
      void this.commit("orch", "orch.prompt_flopped", { prompt_id: this.state.active_round?.prompt_id, engagement: round2(engagement) });
    }
    // CELEBRATE → INTERSTITIAL after a short beat; directives are consumed at the NEXT round_open
    setTimeout(() => {
      this.enqueue({
        kind: "internal",
        fn: async () => {
          if (this.state.micro_state === "CELEBRATE") {
            this.state.micro_state = "INTERSTITIAL";
            this.state.active_round = null;
            this.pushOpsView();
          }
        },
      });
    }, 4000);
  }

  private markHighlight(uid: string): void {
    if (!this.state.objectives.users_with_highlight.includes(uid)) this.state.objectives.users_with_highlight.push(uid);
  }

  private async fanScore(deltas: { uid: string; delta: number }[]): Promise<void> {
    await this.fan({
      type: "s.score",
      deltas,
      totals: this.activeParticipants().map((p) => ({ uid: p.uid, score: p.score })),
    });
  }

  private async opsRoundScrap(reason: string): Promise<void> {
    const r = this.state.active_round;
    if (!r) return;
    if (this.buzzTimer) { clearTimeout(this.buzzTimer); this.buzzTimer = null; }
    await this.commit("ops", "orch.round_scrapped", { prompt_id: r.prompt_id, reason });
    this.state.active_round = null;
    this.state.micro_state = "INTERSTITIAL";
    this.warn("round scrapped — RESCUE beat available in the line deck");
    this.pushOpsView();
  }

  /** M0's voice: operator fires library lines (or free text) through the same s.host_say contract the CTA will use in M2. */
  private async opsHostSay(msg: Extract<OpsMsg, { type: "ops.host_say" }>): Promise<void> {
    if (this.state.flags.safety_hold && msg.line_key !== "SAFETY.RESUME") {
      this.warn("host is silent during SAFETY_HOLD (§3.8)");
      this.pushOpsView();
      return;
    }
    let line_id = "custom";
    let text = msg.text ?? "";
    let est = msg.est_s ?? 0;
    if (msg.line_key) {
      const rendered = this.content.renderLine(msg.line_key, msg.slots ?? {});
      if (!rendered) { this.warn(`no line for key ${msg.line_key}`); this.pushOpsView(); return; }
      line_id = rendered.line_id;
      text = rendered.text;
      est = rendered.est_s;
    }
    if (!text.trim()) return;
    if (!est) est = estimateSeconds(text);
    est = Math.min(est, this.config.cta.line_max_s_default);
    const speaker = this.state.participants.find((p) => p.device_role === "SPEAKER")?.uid ?? null;
    const wire: Extract<ServerMsg, { type: "s.host_say" }> = {
      type: "s.host_say",
      seq: 0,
      line_id,
      text,
      captions: true,
      audio: { mode: "device_tts" },
      speaker_device_uid: speaker,
      est_s: est,
    };
    const { seq: _seq, ...rest } = wire;
    const evt = await this.fan(rest);
    this.lastHostLine = { msg: { ...wire, seq: evt.seq }, at: Date.now() };
    this.pushOpsView();
  }

  private async opsRevealGrant(about_uid: string, field: string, value: string): Promise<void> {
    const p = this.participant(about_uid);
    if (!p) return;
    // §3.5: reveal fields come from the consented vault; visibility never exceeds scope
    const grant = { about_uid, field, value: value.slice(0, 140), earned_by_prompt_id: this.state.active_round?.prompt_id ?? null };
    this.state.reveal_grants.push(grant);
    this.state.objectives.reveal_grants_count++;
    if (!p.reveals_unlocked.includes(field)) p.reveals_unlocked.push(field);
    this.markHighlight(about_uid);
    await this.fan({ type: "s.reveal_grant", ...grant });
    this.pushOpsView();
  }

  private async opsRoleAssign(uid: string, role: "JUDGE" | "READER" | "CAPTAIN"): Promise<void> {
    if (!this.participant(uid)) return;
    await this.fan({ type: "s.role_assign", uid, role, round_scope: 1 });
    this.pushOpsView();
  }

  private async tagMoment(kind: Moment["kind"], tag: string, phrase_hint: string, participants: string[], source: string): Promise<void> {
    const evt = await this.commit(source, "chemistry.moment_tagged", { kind, tag, phrase_hint, participants });
    this.state.moments.push({ seq: evt.seq, kind, tag, phrase_hint, participants });
    if (kind === "BIG_LAUGH") this.state.objectives.group_laugh_moments++;
    if (this.state.moments.length > 40) this.state.moments.shift();
    this.pushOpsView();
  }

  private async opsDirectiveSet(intervention: string, target_uid: string | null, note: string): Promise<void> {
    // §4.2 budgets: one active directive room-wide; two interventions per user per phase
    if (target_uid) {
      const n = this.interventionCount.get(target_uid) ?? 0;
      if (n >= this.config.ica.budgets.per_user_per_phase) {
        this.warn(`intervention budget reached for ${this.name(target_uid)} this phase (${n}/${this.config.ica.budgets.per_user_per_phase}) — §4.5 hard stop: protect from spotlight, mark human follow-up if needed`);
        this.pushOpsView();
        return;
      }
      this.interventionCount.set(target_uid, n + 1);
    }
    this.state.active_directive = {
      directive_id: "dir_" + randomUUID().slice(0, 6),
      intervention,
      target_uid,
      note,
      expires_after_events: 3,
    };
    await this.commit("ops", "chemistry.targeting_directive", { ...this.state.active_directive }); // SEAM: M3 — ICA authors these
    this.pushOpsView();
  }

  private async opsPause(on: boolean, reason?: string): Promise<void> {
    if (this.state.flags.paused === on) return;
    this.state.flags.paused = on;
    if (on) {
      this.pausedAt = Date.now();
      if (this.buzzTimer) { clearTimeout(this.buzzTimer); this.buzzTimer = null; }
    } else if (this.pausedAt !== null) {
      this.state.clock.paused_ms_total += Date.now() - this.pausedAt;
      this.pausedAt = null; // SEAM: M1 — Pacer rebalances budgets on resume (§3.8)
    }
    await this.commit("ops", "orch.pause", { on, reason: reason ?? null });
    await this.fan({ type: "s.pause", on });
    this.pushOpsView();
  }

  private async opsCancelGraceful(reason: string): Promise<void> {
    if (this.state.master_state !== "LOBBY") { this.warn("CANCELLED_GRACEFUL is a LOBBY-only exit (§3.8)"); this.pushOpsView(); return; }
    this.state.flags.cancelled = true;
    this.state.master_state = "CLOSED";
    await this.commit("orch", "orch.cancelled_graceful", { reason });
    await this.fan({ type: "s.phase", master_state: "CLOSED", micro_state: "IDLE" });
    // §3.8: concierge message + the product taking responsibility — M0 renders the apology beat client-side
    await this.finalizeOutcome();
    this.pushOpsView();
  }

  private async opsPollOpen(slots: string[]): Promise<void> {
    const clean = slots.filter((s) => s.trim()).slice(0, this.config.loop.poll_slots);
    if (clean.length < 2) { this.warn("poll needs at least 2 slots"); this.pushOpsView(); return; }
    this.state.cohort_seed.poll = { slots: clean, votes: {}, winning_slot: null };
    // the one-tap next-time (§3.7): fanned as an ALL_TAP-style prompt
    const round: ActiveRound = {
      round_no: this.state.objectives.rounds_played + 1,
      pack_id: "loop",
      prompt_id: "pr_poll",
      mechanic: "ALL_TAP",
      body: { title: "When do we do this again?", text: "Tap the night you can make.", choices: clean },
      targeting: { mode: "OPEN", target_uid: null },
      opened_at: new Date().toISOString(),
      timer_s: 90,
      locks: [],
      taps: {},
      submissions: {},
      winner_uid: null,
      photo_finish: false,
      eligible_uids: this.activeParticipants().filter((p) => p.conn === "CONNECTED").map((p) => p.uid),
    };
    this.state.active_round = round;
    this.state.micro_state = "PROMPT_OPEN";
    await this.commit("orch", "loop.poll_open", { slots: clean });
    await this.fan({ type: "s.prompt", prompt_id: "pr_poll", mechanic: "ALL_TAP", body: round.body, targeting: round.targeting, timer_s: 90 });
    this.pushOpsView();
  }

  private async opsPollClose(): Promise<void> {
    const r = this.state.active_round;
    const poll = this.state.cohort_seed.poll;
    if (!poll) return;
    if (r && r.prompt_id === "pr_poll") {
      const tally = new Array(poll.slots.length).fill(0);
      for (const idx of Object.values(r.taps)) if (idx >= 0 && idx < poll.slots.length) tally[idx]++;
      poll.votes = Object.fromEntries(poll.slots.map((s, i) => [s, tally[i]]));
      const maxIdx = tally.indexOf(Math.max(...tally));
      poll.winning_slot = Math.max(...tally) > 0 ? poll.slots[maxIdx] : null;
      await this.fan({ type: "s.tap_tally", prompt_id: "pr_poll", tally, total: Object.keys(r.taps).length });
      this.state.active_round = null;
      this.state.micro_state = "INTERSTITIAL";
    }
    await this.commit("orch", "loop.poll_closed", { votes: poll.votes, winning_slot: poll.winning_slot });
    await this.maybeEmitLoopArtifacts();
    this.pushOpsView();
  }

  private async opsChristen(name: string): Promise<void> {
    this.state.cohort_seed.name = name.slice(0, 48);
    await this.commit("orch", "loop.cohort_christened", { name: this.state.cohort_seed.name });
    await this.maybeEmitLoopArtifacts();
    this.pushOpsView();
  }

  /** §3.7 — orch.cohort_loop_init once the room has a name and the poll has closed. */
  private async maybeEmitLoopArtifacts(): Promise<void> {
    const seed = this.state.cohort_seed;
    if (this.state.objectives.loop_artifacts_emitted || !seed.name || !seed.poll || seed.poll.winning_slot === null && Object.keys(seed.poll.votes).length === 0) return;
    const top = [...this.state.moments].sort((a, b) => Number(b.kind === "BIG_LAUGH") - Number(a.kind === "BIG_LAUGH")).slice(0, 2);
    seed.top_moments = top.map((m) => m.seq);
    this.state.objectives.loop_artifacts_emitted = true;
    await this.commit("orch", "orch.cohort_loop_init", {
      cohort_id: "coh_" + this.roomId.replace(/^room_/, ""),
      name: seed.name,
      members: this.activeParticipants().map((p) => p.uid),
      top_moments: top.map((m) => ({ tag: m.tag, phrase_hint: m.phrase_hint })),
      poll: seed.poll,
      channel: { type: "WHATSAPP_GROUP", status: "PENDING_OPTIN" }, // SEAM: M4 — the Loop layer
      presence_layer: { ping_quota_per_week: this.config.loop.ping_quota_week, voice_note_max_s: this.config.loop.voice_note_max_s },
    });
    await this.fan({
      type: "s.send_off",
      cohort_name: seed.name,
      winning_slot: seed.poll.winning_slot,
      top_moments: top.map((m) => ({ tag: m.tag, phrase_hint: m.phrase_hint })),
    });
    this.pushOpsView();
  }

  private async opsSpeakerForce(uid: string | null): Promise<void> {
    for (const p of this.state.participants) p.device_role = uid && p.uid === uid ? "SPEAKER" : "MEMBER";
    await this.commit("ops", "orch.speaker_elected", { uid, forced: true });
    this.pushOpsView();
  }

  private async opsCloseRoom(): Promise<void> {
    if (this.state.master_state !== "CLOSED") {
      const from = this.state.master_state;
      this.state.master_state = "CLOSED";
      await this.commit("ops", "orch.state_transition", { from, to: "CLOSED", trigger: "OPERATOR_FORCE" });
      await this.fan({ type: "s.phase", master_state: "CLOSED", micro_state: "IDLE" });
      await this.finalizeOutcome();
    }
    this.pushOpsView();
  }

  /** Room outcome (§6.2 rooms.outcome): landing time, gini_final, flags — the tuning corpus. */
  private async finalizeOutcome(): Promise<void> {
    this.features.applyTo(this.state, this.config.ica.window_s);
    const outcome = {
      landed_at_min: Math.round(this.state.clock.t_elapsed_s / 6) / 10,
      landed_in_window: this.state.clock.t_elapsed_s >= 88 * 60 && this.state.clock.t_elapsed_s <= 95 * 60,
      gini_final: this.state.room_metrics.gini_participation,
      every_user_highlight: this.activeParticipants().every((p) => this.state.objectives.users_with_highlight.includes(p.uid)),
      rounds_played: this.state.objectives.rounds_played,
      reveal_grants: this.state.objectives.reveal_grants_count,
      group_laugh_moments: this.state.objectives.group_laugh_moments,
      cancelled: this.state.flags.cancelled,
      human_followup_uids: this.state.participants.filter((p) => p.human_followup).map((p) => p.uid),
      score_pct: this.activeParticipants().map((p) => ({ uid: p.uid, score_pct: scorePct(p) })),
    };
    await this.commit("orch", "orch.room_outcome", outcome);
    await fs.writeFile(path.join(this.dataRoot, "rooms", this.roomId, "outcome.json"), JSON.stringify(outcome, null, 2));
  }

  // -------------------------------------------------------------- tick (1 s master tick, §2.2.1)

  private tickCount = 0;
  private async onTick(): Promise<void> {
    this.tickCount++;
    const now = Date.now();
    const frozen = this.state.flags.paused || this.state.flags.safety_hold;

    if (this.state.clock.t_start && !frozen && this.state.master_state !== "CLOSED") {
      const started = Date.parse(this.state.clock.t_start);
      this.state.clock.t_elapsed_s = Math.floor((now - started - this.state.clock.paused_ms_total) / 1000);
      this.state.clock.phase_elapsed_s = Math.floor((now - this.phaseStartedAt - this.pausedMsSincePhase()) / 1000);
    }

    // connection audit: CONNECTED → LAGGING (>1.5 s) → DROPPED (>10 s) (§3.4)
    for (const p of this.activeParticipants()) {
      const last = this.lastPongAt.get(p.uid);
      if (last === undefined) continue;
      const age = now - last;
      if (p.conn === "CONNECTED" && age > this.config.conn.lagging_ms && !this.ports.get(p.uid)?.isOpen()) p.conn = "LAGGING";
      if ((p.conn === "CONNECTED" || p.conn === "LAGGING") && age > this.config.conn.dropped_ms && !this.ports.get(p.uid)?.isOpen()) {
        p.conn = "DROPPED";
        await this.commit("orch", "orch.conn", { uid: p.uid, conn: "DROPPED" });
        this.warn(`${p.display} DROPPED — cover once ("COVER_DISCONNECT"), then never again (§3.4)`);
        this.electSpeaker();
      }
    }

    // round timer expiry for TAP/SUBMIT windows
    const r = this.state.active_round;
    if (r && this.state.micro_state === "PROMPT_OPEN" && !frozen) {
      const openFor = (now - Date.parse(r.opened_at)) / 1000;
      if (openFor >= r.timer_s && (TAP_MECHANICS.includes(r.mechanic) || SUBMIT_MECHANICS.includes(r.mechanic))) {
        await this.closeTapOrSubmit();
      }
    }

    // pacing telemetry — SEAM: M1 turns these warnings into pacer.phase_gate_proposal authority
    if (!frozen && this.state.clock.t_start && this.state.master_state !== "CLOSED" && this.state.master_state !== "LOBBY") {
      const { phase_elapsed_s, phase_budget_s, t_elapsed_s, session_hard_stop_s } = this.state.clock;
      if (phase_budget_s.max > 0 && phase_elapsed_s === phase_budget_s.max - 120) {
        await this.commit("pacer", "pacer.time_warning", { phase: this.state.master_state, remaining_s: 120 });
        this.warn(`${this.state.master_state} hits max budget in 2:00 — line up the transition`);
      }
      if (phase_budget_s.max > 0 && phase_elapsed_s === phase_budget_s.max) {
        await this.commit("pacer", "pacer.time_warning", { phase: this.state.master_state, remaining_s: 0, force_available: true });
        this.warn(`${this.state.master_state} is AT max budget — the blueprint force-advances here (§3.1). Advance now.`);
      }
      if (t_elapsed_s === session_hard_stop_s - 300) this.warn("5:00 to the 95-minute hard stop");
      if (t_elapsed_s >= session_hard_stop_s && this.state.master_state !== ("CLOSED" as MasterState)) this.warn("HARD STOP passed (95 min) — close the room (§3.1)");
    }

    // silence + stalemate hints (§4.6) on the ICA cadence
    if (this.tickCount % this.config.ica.tick_s === 0) {
      this.state.room_metrics.silence_run_ms = now - this.lastInteractionAt;
      this.features.applyTo(this.state, this.config.ica.window_s, now);
      this.decayLaughCounter(now);
      if (!frozen && this.state.master_state !== "LOBBY" && this.state.master_state !== "CLOSED") {
        const ctx =
          now - this.lastLaughMomentAt < 10_000
            ? this.config.ica.stalemate_s.afterglow // sacred; do not touch (§4.6)
            : this.state.micro_state === "INTERSTITIAL" || this.state.micro_state === "IDLE"
              ? this.config.ica.stalemate_s.interstitial
              : this.config.ica.stalemate_s.discussion;
        if (this.state.room_metrics.silence_run_ms > ctx * 1000) {
          const cb = this.bestCallback();
          this.warn(
            cb
              ? `stalemate (${Math.round(this.state.room_metrics.silence_run_ms / 1000)} s) — ladder rung 1: CALLBACK "${cb.phrase_hint}"`
              : `stalemate (${Math.round(this.state.room_metrics.silence_run_ms / 1000)} s) — ladder rung 2: BINARY_BLITZ (fire an ALL_TAP)`,
          );
        }
        // withdrawal telemetry (advisory in M0 — the operator is the ICA)
        for (const p of this.activeParticipants()) {
          const since = this.features.secondsSinceLast(p.uid, now);
          if (since !== null && since > this.config.ica.withdrawal.zero_interaction_min * 60 && p.conn === "CONNECTED") {
            this.warn(`${p.display}: zero interactions for ${Math.floor(since / 60)} min — QUIET ladder: COVER_MECHANIC → PAIR_SHIELD → ENGINEERED_WIN (§4.5)`);
          }
        }
      }
      this.pushOpsView();
    }
  }

  private lastLaughDecayAt = Date.now();
  private decayLaughCounter(now: number): void {
    if (now - this.lastLaughDecayAt > 5 * 60_000) {
      this.state.room_metrics.laughter_events_5m = 0;
      this.lastLaughDecayAt = now;
    }
  }

  private phasePausedBase = 0;
  private pausedMsSincePhase(): number {
    // paused time accrued after the current phase began
    return Math.max(0, this.state.clock.paused_ms_total - this.phasePausedBase);
  }

  private bestCallback(): Moment | null {
    const candidates = this.state.moments.filter((m) => m.kind === "BIG_LAUGH" || m.kind === "OPERATOR_TAGGED");
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  // -------------------------------------------------------------- projections

  /** RoomState-lite for clients: no vault, no submissions content, no answer keys. */
  projectClient(): unknown {
    const s = this.state;
    return {
      room_id: s.room_id,
      state_version: s.state_version,
      master_state: s.master_state,
      micro_state: s.micro_state,
      clock: { t_elapsed_s: s.clock.t_elapsed_s, phase_elapsed_s: s.clock.phase_elapsed_s },
      participants: s.participants.map((p) => ({
        uid: p.uid,
        display: p.display,
        conn: p.conn,
        device_role: p.device_role,
        score: p.score,
        reveals_unlocked: p.reveals_unlocked,
      })),
      reveal_grants: s.reveal_grants,
      active_round: s.active_round
        ? {
            prompt_id: s.active_round.prompt_id,
            mechanic: s.active_round.mechanic,
            body: s.active_round.body,
            targeting: s.active_round.targeting,
            timer_s: s.active_round.timer_s,
            opened_at: s.active_round.opened_at,
            winner_uid: s.active_round.winner_uid,
          }
        : null,
      flags: s.flags,
      cohort: { name: s.cohort_seed.name, winning_slot: s.cohort_seed.poll?.winning_slot ?? null },
    };
  }

  buildOpsView(): OpsView {
    const r = this.state.active_round;
    const submissions =
      r && SUBMIT_MECHANICS.includes(r.mechanic)
        ? Object.entries(r.submissions).map(([uid, value]) => ({ uid, display: this.name(uid), value }))
        : null;
    const view: OpsView = {
      state: this.state,
      warnings: this.warnings.slice(-8),
      submissions_pending: submissions,
      last_events: [],
    };
    return JSON.parse(JSON.stringify({ ...view, vault: Object.fromEntries(this.vault) })) as OpsView;
  }

  async recentEvents(n: number): Promise<EventEnvelope[]> {
    return this.log.tail(n);
  }

  private warn(text: string): void {
    const stamped = `${new Date().toISOString().slice(11, 19)}Z ${text}`;
    this.warnings.push(stamped);
    if (this.warnings.length > 30) this.warnings.shift();
  }

  private name(uid: string): string {
    return this.participant(uid)?.display ?? uid;
  }

  // -------------------------------------------------------------- restore

  static async restore(roomId: string, dataRoot: string, content: ContentStore): Promise<RoomActor | null> {
    const log = new RoomLog(dataRoot, roomId);
    await log.init();
    const snap = await log.readSnapshot();
    if (!snap) return null;
    const actor = new RoomActor(roomId, dataRoot, content, undefined, snap.state as RoomState);
    // clients show "Rawi is catching his breath" and auto-resync (§2.2.1)
    actor.state.state_version = snap.seq;
    for (const p of actor.state.participants) if (p.conn !== "LEFT") p.conn = "DROPPED";
    return actor;
  }
}

function fmtMin(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * SILA M0 soak test.
 *
 * Part A — deterministic RoomActor tests with fake ports (no network):
 *   buzz order follows t_adj = t_recv − rtt/2 (NOT arrival order),
 *   30 ms tie → photo_finish + moment, auto answer-key scoring,
 *   ALL_TAP tally + auto-close, ALL_SUBMIT privacy, SAFETY_HOLD freeze,
 *   snapshot → restore.
 *
 * Part B — end-to-end over real HTTP/WS on a scratch port:
 *   join → ticket → hello → state_sync, ops view stream, host_say fan-out,
 *   reveal_grant, drop → rejoin replay (seq > last_seq), E-loop poll +
 *   christening → s.send_off, close → outcome.json.
 *
 * Run: npm run sim
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import WebSocket from "ws";
import { RoomActor, type ClientPort } from "../server/actor.js";
import { ContentStore } from "../server/lines.js";
import type { ServerMsg } from "../server/contracts.js";

const PORT = 8899;
let passed = 0;
function ok(cond: unknown, label: string): void {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    console.error(`  \u2717 FAIL: ${label}`);
    process.exit(1);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- fake port

class FakePort implements ClientPort {
  msgs: ServerMsg[] = [];
  private open = true;
  constructor(public uid: string, private rtt: number) {}
  send(m: ServerMsg) {
    this.msgs.push(m);
  }
  isOpen() {
    return this.open;
  }
  close() {
    this.open = false;
  }
  rttMs() {
    return this.rtt;
  }
  last(type: string): ServerMsg | undefined {
    return [...this.msgs].reverse().find((m) => m.type === type);
  }
}

// resolves once the actor's queue has drained past this point
const flush = (a: RoomActor) =>
  new Promise<void>((res) => a.enqueue({ kind: "internal", fn: async () => res() } as never));

async function partA(): Promise<void> {
  console.log("\nPart A \u2014 actor determinism");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sila-sim-"));
  const content = new ContentStore();
  await content.load(path.resolve("content"));

  const actor = new RoomActor("room_sim", tmp, content);
  await actor.init();

  // seat + attach four players with very different RTTs
  const rtts: Record<string, number> = { Ana: 200, Raj: 0, Kim: 60, Omar: 20 };
  const ports = new Map<string, FakePort>();
  for (const name of Object.keys(rtts)) {
    const j = actor.join(name, [], { fact: `${name} fact` });
    ok("uid" in j, `join ${name}`);
    const port = new FakePort((j as { uid: string }).uid, rtts[name]);
    ports.set(name, port);
    actor.enqueue({ kind: "attach", port, last_seq: 0 } as never);
  }
  await flush(actor);
  ok(actor.state.participants.filter((p) => p.conn === "CONNECTED").length === 4, "4 connected");

  // LOBBY \u2192 A (4 present, gate satisfied without force)
  actor.enqueue({ kind: "ops", msg: { type: "ops.state_transition", to: "A_BASELINE" } } as never);
  await flush(actor);
  ok(actor.state.master_state === "A_BASELINE", "LOBBY \u2192 A on gate");

  // A \u2192 B needs force (min time not elapsed) \u2014 verify the gate holds first
  actor.enqueue({ kind: "ops", msg: { type: "ops.state_transition", to: "B_REACTION" } } as never);
  await flush(actor);
  ok(actor.state.master_state === "A_BASELINE", "min-time gate blocks A \u2192 B");
  actor.enqueue({ kind: "ops", msg: { type: "ops.state_transition", to: "B_REACTION", force: true } } as never);
  await flush(actor);
  ok(actor.state.master_state === "B_REACTION", "force advances A \u2192 B (logged)");

  // ---- buzz fairness: arrival order \u2260 adjusted order
  actor.enqueue({ kind: "ops", msg: { type: "ops.round_open", pack_id: "pk_b_food_uae_01", prompt_id: "pr_b_karak_price" } } as never);
  await flush(actor);
  const T = Date.now();
  const buzz = (name: string, t_recv: number) =>
    actor.enqueue({ kind: "client", uid: ports.get(name)!.uid, msg: { type: "c.buzz", prompt_id: "pr_b_karak_price", t_client: t_recv }, t_recv_ms: t_recv } as never);
  buzz("Raj", T); //        rtt 0   \u2192 t_adj = T
  buzz("Ana", T + 40); //   rtt 200 \u2192 t_adj = T \u2212 60  \u2190 pressed first in truth
  await sleep(260); //      lock window 150 ms + slack
  await flush(actor);
  const res1 = ports.get("Raj")!.last("s.buzz_result") as Extract<ServerMsg, { type: "s.buzz_result" }>;
  ok(res1 && res1.winner_uid === ports.get("Ana")!.uid, "RTT compensation: later arrival, earlier press \u2192 Ana wins");
  ok(res1.order[0] === ports.get("Ana")!.uid && res1.order[1] === ports.get("Raj")!.uid, "order sorted by t_adj");
  ok(res1.photo_finish === false, "\u039460 ms > tie window \u2192 no photo finish");

  // winner answers via accept-key \u2192 auto +10
  actor.enqueue({ kind: "client", uid: ports.get("Ana")!.uid, msg: { type: "c.answer", prompt_id: "pr_b_karak_price", value: "one dirham" }, t_recv_ms: Date.now() } as never);
  await flush(actor);
  ok(actor.state.participants.find((p) => p.uid === ports.get("Ana")!.uid)!.score === 10, "accept-list answer auto-scores +10");
  ok(actor.state.micro_state === "CELEBRATE", "round resolved to CELEBRATE");
  await sleep(4300);
  await flush(actor); // CELEBRATE \u2192 INTERSTITIAL beat

  // ---- photo finish (\u0394 20 ms \u2264 30 ms)
  actor.enqueue({ kind: "ops", msg: { type: "ops.round_open", pack_id: "pk_b_city_uae_01", prompt_id: "pr_b_salik" } } as never);
  await flush(actor);
  const T2 = Date.now();
  actor.enqueue({ kind: "client", uid: ports.get("Kim")!.uid, msg: { type: "c.buzz", prompt_id: "pr_b_salik", t_client: T2 }, t_recv_ms: T2 + 30 } as never); //  rtt 60 \u2192 adj T2
  actor.enqueue({ kind: "client", uid: ports.get("Omar")!.uid, msg: { type: "c.buzz", prompt_id: "pr_b_salik", t_client: T2 }, t_recv_ms: T2 + 30 } as never); // rtt 20 \u2192 adj T2+20
  await sleep(260);
  await flush(actor);
  const res2 = ports.get("Kim")!.last("s.buzz_result") as Extract<ServerMsg, { type: "s.buzz_result" }>;
  ok(res2.photo_finish === true, "\u039420 ms \u2264 30 ms \u2192 photo_finish");
  ok(actor.state.moments.some((m) => m.kind === "PHOTO_FINISH"), "photo finish auto-tags a moment");
  actor.enqueue({ kind: "ops", msg: { type: "ops.adjudicate", correct: true } } as never);
  await flush(actor);
  await sleep(4300);
  await flush(actor);

  // ---- ALL_TAP: tally + auto-close when everyone is in
  actor.enqueue({ kind: "ops", msg: { type: "ops.round_open", pack_id: "pk_b_blitz_01", prompt_id: "pr_b_karak_capp" } } as never);
  await flush(actor);
  for (const [i, name] of ["Ana", "Raj", "Kim", "Omar"].entries()) {
    actor.enqueue({ kind: "client", uid: ports.get(name)!.uid, msg: { type: "c.answer", prompt_id: "pr_b_karak_capp", value: i % 2 }, t_recv_ms: Date.now() } as never);
  }
  await flush(actor);
  const tally = ports.get("Ana")!.last("s.tap_tally") as Extract<ServerMsg, { type: "s.tap_tally" }>;
  ok(tally && tally.total === 4 && tally.tally[0] === 2 && tally.tally[1] === 2, "ALL_TAP auto-closes on full house, tally 2/2");
  await sleep(4300);
  await flush(actor);

  // ---- ALL_SUBMIT: private to the room, visible to ops
  actor.enqueue({ kind: "ops", msg: { type: "ops.round_open", pack_id: "pk_a_handshake_01", prompt_id: "pr_a_word_week" } } as never);
  await flush(actor);
  for (const name of ["Ana", "Raj", "Kim", "Omar"]) {
    actor.enqueue({ kind: "client", uid: ports.get(name)!.uid, msg: { type: "c.answer", prompt_id: "pr_a_word_week", value: `${name.toLowerCase()}-word` }, t_recv_ms: Date.now() } as never);
  }
  await flush(actor);
  const view = actor.buildOpsView() as unknown as { submissions_pending: { display: string; value: string }[] | null };
  ok(actor.state.micro_state === "ADJUDICATE", "ALL_SUBMIT closes to ADJUDICATE");
  ok(view.submissions_pending?.length === 4, "operator sees 4 submissions");
  const anyClientSawContent = ports.get("Ana")!.msgs.some((m) => JSON.stringify(m).includes("raj-word"));
  ok(!anyClientSawContent, "submission content never fans out to clients");
  actor.enqueue({ kind: "ops", msg: { type: "ops.adjudicate", correct: false, winner_uid: null } } as never);
  await flush(actor);

  // ---- safety hold freezes the round path
  actor.enqueue({ kind: "client", uid: ports.get("Kim")!.uid, msg: { type: "c.safety", severity: "HIGH" }, t_recv_ms: Date.now() } as never);
  await flush(actor);
  ok(actor.state.flags.safety_hold === true && actor.state.active_round === null, "HIGH safety \u2192 hold on, round frozen");
  actor.enqueue({ kind: "ops", msg: { type: "ops.round_open", pack_id: "pk_b_blitz_01", prompt_id: "pr_b_old_new" } } as never);
  await flush(actor);
  ok(actor.state.active_round === null, "round_open refused during hold");
  const safetyLog = await fs.readFile(path.join(tmp, "rooms", "room_sim", "safety.jsonl"), "utf8");
  ok(safetyLog.includes("HIGH") && safetyLog.includes(ports.get("Kim")!.uid), "reporter recorded in restricted safety.jsonl");
  const sharedLog = await fs.readFile(path.join(tmp, "rooms", "room_sim", "events.jsonl"), "utf8");
  ok(!sharedLog.split("\n").some((l) => l.includes("safety.incident") && l.includes(ports.get("Kim")!.uid)), "reporter NOT in the shared event log");
  actor.enqueue({ kind: "ops", msg: { type: "ops.hold", on: false, reason: "resolved" } } as never);
  await flush(actor);
  ok(actor.state.flags.safety_hold === false, "operator releases hold");

  // ---- snapshot \u2192 restore
  const seqBefore = actor.state.state_version;
  await actor.shutdown();
  const revived = await RoomActor.restore("room_sim", tmp, content);
  ok(revived !== null && revived.state.state_version === seqBefore, `restore hydrates at seq ${seqBefore}`);
  ok(revived!.state.participants.every((p) => p.conn === "DROPPED" || p.conn === "LEFT"), "restored participants marked DROPPED (await resync)");
  await revived!.shutdown();
  await fs.rm(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- Part B: E2E

interface WsHarness {
  ws: WebSocket;
  inbox: ServerMsg[];
}
function wsClient(url: string): WsHarness {
  const ws = new WebSocket(url);
  const h: WsHarness = { ws, inbox: [] };
  ws.on("message", (raw) => {
    try {
      h.inbox.push(JSON.parse(String(raw)));
    } catch {
      /* ignore */
    }
  });
  return h;
}
async function waitFor<T extends ServerMsg>(h: WsHarness, type: string, ms = 4000): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = h.inbox.find((m) => m.type === type);
    if (hit) return hit as T;
    await sleep(40);
  }
  throw new Error(`timeout waiting for ${type}`);
}

async function partB(): Promise<void> {
  console.log("\nPart B \u2014 end-to-end over HTTP/WS");
  process.env.PORT = String(PORT);
  process.env.SILA_OPS_KEY = "sim-ops-key";
  process.env.SILA_DATA = await fs.mkdtemp(path.join(os.tmpdir(), "sila-e2e-"));
  const { main } = await import("../server/server.js");
  const server = await main();
  await sleep(300);
  const base = `http://localhost:${PORT}`;
  const api = async (p: string, init?: RequestInit) => {
    const r = await fetch(base + p, init);
    return { status: r.status, body: await r.json() };
  };

  const created = await api("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops_key: "sim-ops-key" }) });
  ok(created.status === 201, "room created with ops key");
  const roomId = (created.body as { room_id: string }).room_id;

  const badKey = await api("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops_key: "nope" }) });
  ok(badKey.status === 403, "bad ops key rejected");

  const joinP = (display: string) =>
    api(`/api/rooms/${roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ display, vault: { comfort_food: `${display}'s dish` } }) });
  const ana = (await joinP("Ana")).body as { uid: string; ticket: string };
  const raj = (await joinP("Raj")).body as { uid: string; ticket: string };
  ok(!!ana.ticket && !!raj.ticket, "join returns uid + HMAC ticket");

  const hello = (h: WsHarness, u: { uid: string; ticket: string }, last = 0) =>
    h.ws.on("open", () => h.ws.send(JSON.stringify({ type: "c.hello", uid: u.uid, room_ticket: u.ticket, last_seq: last, device_caps: { audio_out: true, battery: null, net: "good" } })));

  const anaWs = wsClient(`ws://localhost:${PORT}/ws/room/${roomId}`);
  hello(anaWs, ana);
  const rajWs = wsClient(`ws://localhost:${PORT}/ws/room/${roomId}`);
  hello(rajWs, raj);
  await waitFor(anaWs, "s.state_sync");
  await waitFor(rajWs, "s.state_sync");
  ok(true, "hello \u2192 state_sync for both players");

  // forged ticket refused
  const forged = wsClient(`ws://localhost:${PORT}/ws/room/${roomId}`);
  forged.ws.on("open", () => forged.ws.send(JSON.stringify({ type: "c.hello", uid: ana.uid, room_ticket: "v1.x.y.99.zz", last_seq: 0 })));
  const err = await waitFor(forged, "s.error");
  ok((err as { code: string }).code === "bad_ticket", "forged ticket refused");

  // ops channel
  const opsWs = wsClient(`ws://localhost:${PORT}/ws/ops/${roomId}?key=sim-ops-key`);
  await new Promise<void>((res) => opsWs.ws.on("open", () => res()));
  const opsView = async (ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = [...opsWs.inbox].reverse().find((m) => (m as { type: string }).type === "ops.view");
      if (hit) return (hit as unknown as { view: { state: { master_state: string; micro_state: string; cohort_seed: { name: string | null } }; submissions_pending: unknown[] | null } }).view;
      await sleep(60);
    }
    throw new Error("no ops.view");
  };
  ok((await opsView()).state.master_state === "LOBBY", "ops view streams (LOBBY)");
  const opsSend = (m: unknown) => opsWs.ws.send(JSON.stringify(m));

  // 2 present < 4 \u2192 force to start
  opsSend({ type: "ops.state_transition", to: "A_BASELINE", force: true });
  await sleep(200);
  ok((await opsView()).state.master_state === "A_BASELINE", "forced LOBBY \u2192 A with 2 present");

  // host line fans to everyone, one device is the SPEAKER
  opsSend({ type: "ops.host_say", line_key: "A.HOST_WELCOME" });
  const say = await waitFor<Extract<ServerMsg, { type: "s.host_say" }>>(anaWs, "s.host_say");
  ok(say.text.length > 10 && say.captions === true, "library line fired with captions");
  ok(say.speaker_device_uid === ana.uid || say.speaker_device_uid === raj.uid, "one SPEAKER device elected for TTS");

  // submissions: private + visible to ops
  opsSend({ type: "ops.round_open", pack_id: "pk_a_handshake_01", prompt_id: "pr_a_word_week" });
  await waitFor(anaWs, "s.prompt");
  anaWs.ws.send(JSON.stringify({ type: "c.answer", prompt_id: "pr_a_word_week", value: "buzzing" }));
  rajWs.ws.send(JSON.stringify({ type: "c.answer", prompt_id: "pr_a_word_week", value: "chaotic" }));
  await sleep(300);
  const v2 = await opsView();
  ok(v2.submissions_pending?.length === 2, "operator sees both submissions");
  opsSend({ type: "ops.adjudicate", correct: false, winner_uid: null });
  await sleep(150);

  // reveal grant lands on clients
  opsSend({ type: "ops.reveal_grant", about_uid: raj.uid, field: "comfort_food", value: "Raj's dish" });
  const grant = await waitFor<Extract<ServerMsg, { type: "s.reveal_grant" }>>(anaWs, "s.reveal_grant");
  ok(grant.about_uid === raj.uid, "reveal_grant fans out to clients");

  // drop \u2192 rejoin replay: miss a line, get it back via last_seq
  const lastSeq = Math.max(...anaWs.inbox.map((m) => (m as { seq?: number }).seq ?? 0));
  anaWs.ws.close();
  await sleep(200);
  opsSend({ type: "ops.host_say", line_key: "B.ROUND_INTRO" }); // Ana misses this live
  await sleep(200);
  const anaWs2 = wsClient(`ws://localhost:${PORT}/ws/room/${roomId}`);
  hello(anaWs2, ana, lastSeq);
  await waitFor(anaWs2, "s.state_sync");
  const replayed = await waitFor<Extract<ServerMsg, { type: "s.host_say" }>>(anaWs2, "s.host_say").catch(() => null);
  ok(replayed !== null, "rejoin replays the missed host line (seq > last_seq)");

  // walk to E and run the loop: poll \u2192 christen \u2192 send_off
  for (const to of ["B_REACTION", "C_DISCOVERY", "D_IMPROV", "E_LOOP"]) {
    opsSend({ type: "ops.state_transition", to, force: true });
    await sleep(120);
  }
  ok((await opsView()).state.master_state === "E_LOOP", "walked to E_LOOP");
  opsSend({ type: "ops.poll_open", slots: ["Thu 21:00", "Fri 19:30", "Sun 20:00"] });
  await waitFor(anaWs2, "s.prompt");
  anaWs2.ws.send(JSON.stringify({ type: "c.answer", prompt_id: "pr_poll", value: 0 }));
  rajWs.ws.send(JSON.stringify({ type: "c.answer", prompt_id: "pr_poll", value: 0 }));
  await sleep(200);
  opsSend({ type: "ops.poll_close" });
  opsSend({ type: "ops.christen", name: "The Karak Cartel" });
  const sendoff = await waitFor<Extract<ServerMsg, { type: "s.send_off" }>>(anaWs2, "s.send_off");
  ok(sendoff.cohort_name === "The Karak Cartel" && sendoff.winning_slot === "Thu 21:00", "christen + poll \u2192 s.send_off with name & winning slot");

  // close \u2192 outcome.json
  opsSend({ type: "ops.state_transition", to: "CLOSED", force: true });
  await sleep(300);
  const outcomeRaw = await fs.readFile(path.join(process.env.SILA_DATA!, "rooms", roomId, "outcome.json"), "utf8");
  const outcome = JSON.parse(outcomeRaw);
  ok(typeof outcome.landed_at_min === "number" && "gini_final" in outcome, "outcome.json written on close");

  // cleanup
  anaWs2.ws.close();
  rajWs.ws.close();
  opsWs.ws.close();
  await server.close();
  await sleep(100);
  await fs.rm(process.env.SILA_DATA!, { recursive: true, force: true });
}

async function run(): Promise<void> {
  await partA();
  await partB();
  console.log(`\n\u2713 all ${passed} assertions passed\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error("\nsim error:", err);
  process.exit(1);
});

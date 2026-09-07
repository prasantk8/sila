/**
 * SILA M0 server — one Node process hosting:
 *   - static clients:  /play (player PWA)  and  /ops (Operator Console)
 *   - REST:            room lifecycle, join → ticket, content
 *   - WebSocket:       /ws/room/:id (players)  and  /ws/ops/:id (operator)
 *
 * The server is a thin transport shell. All room truth lives in RoomActor
 * (single-writer). Boot restores every room found on disk from its snapshot
 * (§2.2.1: supervisor restart target < 3 s).
 */

import http from "node:http";
import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { RoomActor, type ClientPort, type OpsPort } from "./actor.js";
import { ContentStore } from "./lines.js";
import { initSecret, issueTicket, verifyTicket } from "./tickets.js";
import { listRoomIds } from "./log.js";
import type { ClientMsg, OpsMsg, ServerMsg } from "./contracts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const CONTENT_DIR = path.join(ROOT, "content");
const DATA_ROOT = process.env.SILA_DATA ?? path.join(ROOT, "data");
const PORT = Number(process.env.PORT ?? 8080);

// ---------------------------------------------------------------- ops key

async function initOpsKey(): Promise<string> {
  if (process.env.SILA_OPS_KEY) return process.env.SILA_OPS_KEY;
  const p = path.join(DATA_ROOT, "ops.key");
  try {
    return (await fs.readFile(p, "utf8")).trim();
  } catch {
    const key = randomBytes(9).toString("base64url");
    await fs.mkdir(DATA_ROOT, { recursive: true });
    await fs.writeFile(p, key, { mode: 0o600 });
    return key;
  }
}

// ---------------------------------------------------------------- registry

const rooms = new Map<string, RoomActor>();
const content = new ContentStore();

async function getRoom(id: string): Promise<RoomActor | null> {
  return rooms.get(id) ?? null;
}

async function createRoom(): Promise<RoomActor> {
  const id = "room_" + randomBytes(3).toString("hex");
  const actor = new RoomActor(id, DATA_ROOT, content);
  await actor.init();
  rooms.set(id, actor);
  return actor;
}

async function restoreRooms(): Promise<void> {
  for (const id of await listRoomIds(DATA_ROOT)) {
    if (rooms.has(id)) continue;
    const actor = await RoomActor.restore(id, DATA_ROOT, content);
    if (actor) {
      await actor.init();
      rooms.set(id, actor);
      console.log(`  restored ${id} (${actor.state.master_state}, seq ${actor.state.state_version})`);
    }
  }
}

// ---------------------------------------------------------------- HTTP

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function serveStatic(res: http.ServerResponse, urlPath: string): Promise<boolean> {
  // /play → public/play/index.html ; /ops → public/ops/index.html
  let rel = urlPath.replace(/^\/+/, "");
  if (rel === "" || rel === "play") rel = "play/index.html";
  if (rel === "ops") rel = "ops/index.html";
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return false; // path traversal guard
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

let OPS_KEY = "";

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const seg = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const method = req.method ?? "GET";

  // GET /api/content/packs | /api/content/lines
  if (method === "GET" && seg[1] === "content") {
    if (seg[2] === "packs") return json(res, 200, [...content.packs.values()]);
    if (seg[2] === "lines") return json(res, 200, [...content.lines.values()]);
  }

  // GET /api/rooms — public list (id + phase + seat count only)
  if (method === "GET" && seg[1] === "rooms" && seg.length === 2) {
    const list = [...rooms.values()].map((r) => ({
      room_id: r.roomId,
      master_state: r.state.master_state,
      seated: r.state.participants.filter((p) => p.conn !== "LEFT").length,
    }));
    return json(res, 200, list);
  }

  // POST /api/rooms — create (ops key required)
  if (method === "POST" && seg[1] === "rooms" && seg.length === 2) {
    const body = await readBody(req);
    if (body.ops_key !== OPS_KEY) return json(res, 403, { error: "bad_ops_key" });
    const actor = await createRoom();
    return json(res, 201, { room_id: actor.roomId });
  }

  // POST /api/rooms/:id/join — { display, affinity_tags?, vault? } → { uid, ticket }
  if (method === "POST" && seg[1] === "rooms" && seg[3] === "join") {
    const actor = await getRoom(seg[2]);
    if (!actor) return json(res, 404, { error: "no_such_room" });
    const body = await readBody(req);
    const display = String(body.display ?? "").trim();
    if (!display) return json(res, 400, { error: "display_required" });
    const tags = Array.isArray(body.affinity_tags) ? body.affinity_tags.map(String) : [];
    const vault =
      body.vault && typeof body.vault === "object"
        ? Object.fromEntries(Object.entries(body.vault as Record<string, unknown>).map(([k, v]) => [String(k).slice(0, 32), String(v).slice(0, 140)]))
        : {};
    const joined = actor.join(display, tags, vault);
    if ("error" in joined) return json(res, 409, joined);
    return json(res, 200, { uid: joined.uid, ticket: issueTicket(actor.roomId, joined.uid) });
  }

  // GET /api/rooms/:id/summary — outcome + tail (ops key via ?key=)
  if (method === "GET" && seg[1] === "rooms" && seg[3] === "summary") {
    if (url.searchParams.get("key") !== OPS_KEY) return json(res, 403, { error: "bad_ops_key" });
    const actor = await getRoom(seg[2]);
    if (!actor) return json(res, 404, { error: "no_such_room" });
    let outcome: unknown = null;
    try {
      outcome = JSON.parse(await fs.readFile(path.join(DATA_ROOT, "rooms", actor.roomId, "outcome.json"), "utf8"));
    } catch {
      /* room not closed yet */
    }
    return json(res, 200, { state: actor.state, outcome, events_tail: await actor.recentEvents(40) });
  }

  // GET /api/rooms/:id/events?after=N — ops event tail (ops key via ?key=)
  if (method === "GET" && seg[1] === "rooms" && seg[3] === "events") {
    if (url.searchParams.get("key") !== OPS_KEY) return json(res, 403, { error: "bad_ops_key" });
    const actor = await getRoom(seg[2]);
    if (!actor) return json(res, 404, { error: "no_such_room" });
    return json(res, 200, await actor.recentEvents(Number(url.searchParams.get("n") ?? 60)));
  }

  json(res, 404, { error: "not_found" });
}

// ---------------------------------------------------------------- WS ports

/** Player port with server-side ping/pong RTT EWMA — feeds buzz-fairness rtt/2. */
class WsClientPort implements ClientPort {
  uid: string;
  private ws: WebSocket;
  private rtt: number | null = null;
  private pingAt = 0;
  private pinger: NodeJS.Timeout;

  constructor(uid: string, ws: WebSocket, onPong: () => void) {
    this.uid = uid;
    this.ws = ws;
    this.pinger = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        this.pingAt = Date.now();
        ws.ping();
      }
    }, 2000);
    ws.on("pong", () => {
      const sample = Date.now() - this.pingAt;
      this.rtt = this.rtt === null ? sample : 0.7 * this.rtt + 0.3 * sample; // EWMA
      onPong();
    });
    ws.on("close", () => clearInterval(this.pinger));
  }
  send(msg: ServerMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }
  close(): void {
    clearInterval(this.pinger);
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
  rttMs(): number | null {
    return this.rtt;
  }
}

class WsOpsPort implements OpsPort {
  constructor(private ws: WebSocket) {}
  send(view: unknown): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "ops.view", view }));
  }
  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }
}

// ---------------------------------------------------------------- boot

export interface ServerHandle {
  close(): Promise<void>;
  port: number;
}

export async function main(): Promise<ServerHandle> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await initSecret(DATA_ROOT);
  OPS_KEY = await initOpsKey();
  await content.load(CONTENT_DIR);
  const coverage = content.coverageWarnings();
  for (const w of coverage) console.warn("  [content] " + w);
  await restoreRooms();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
    if (await serveStatic(res, url.pathname)) return;
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // ["ws","room",id] | ["ws","ops",id]
    if (parts[0] !== "ws" || (parts[1] !== "room" && parts[1] !== "ops") || !parts[2]) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (parts[1] === "room") void attachPlayer(ws, parts[2]);
      else void attachOps(ws, parts[2], url.searchParams.get("key") ?? "");
    });
  });

  async function attachPlayer(ws: WebSocket, roomId: string): Promise<void> {
    const actor = await getRoom(roomId);
    if (!actor) {
      ws.send(JSON.stringify({ type: "s.error", code: "no_such_room" }));
      ws.close();
      return;
    }
    let port: WsClientPort | null = null;

    ws.on("message", (raw) => {
      const t_recv_ms = Date.now(); // stamped at the socket, before any queueing (§2.3 buzz fairness)
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw)) as ClientMsg;
      } catch {
        return;
      }
      if (msg.type === "c.hello") {
        const v = verifyTicket(msg.room_ticket, roomId);
        if (!v.ok || v.uid !== msg.uid) {
          ws.send(JSON.stringify({ type: "s.error", code: "bad_ticket", detail: v.ok ? "uid_mismatch" : v.reason }));
          ws.close();
          return;
        }
        port = new WsClientPort(msg.uid, ws, () => actor.notePong(msg.uid));
        // device caps ride in on hello for speaker election
        if (msg.device_caps) {
          const p = actor.state.participants.find((x) => x.uid === msg.uid);
          if (p) p.device_caps = { ...p.device_caps, ...msg.device_caps };
        }
        actor.enqueue({ kind: "attach", port, last_seq: msg.last_seq ?? 0 });
        return;
      }
      if (msg.type === "c.time_ping") {
        // answered at the transport for minimum jitter — the client medians 5 of these
        ws.send(JSON.stringify({ type: "s.time_pong", t0: msg.t0_client, t1_server: Date.now() }));
        if (port) actor.notePong(port.uid);
        return;
      }
      if (!port) return; // everything else requires hello first
      actor.enqueue({ kind: "client", uid: port.uid, msg, t_recv_ms });
    });

    ws.on("close", () => {
      if (port) actor.enqueue({ kind: "detach", uid: port.uid });
    });
  }

  async function attachOps(ws: WebSocket, roomId: string, key: string): Promise<void> {
    if (key !== OPS_KEY) {
      ws.send(JSON.stringify({ type: "ops.error", code: "bad_ops_key" }));
      ws.close();
      return;
    }
    const actor = await getRoom(roomId);
    if (!actor) {
      ws.send(JSON.stringify({ type: "ops.error", code: "no_such_room" }));
      ws.close();
      return;
    }
    const port = new WsOpsPort(ws);
    actor.addOpsPort(port);
    ws.on("message", (raw) => {
      let msg: OpsMsg;
      try {
        msg = JSON.parse(String(raw)) as OpsMsg;
      } catch {
        return;
      }
      if (msg.type === "ops.hello") return; // key already verified on upgrade
      actor.enqueue({ kind: "ops", msg });
    });
    ws.on("close", () => actor.removeOpsPort(port));
  }

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log("");
      console.log("  SILA M0 — The Invisible Host (Wizard-of-Oz)");
      console.log("  --------------------------------------------");
      console.log(`  Player PWA        http://localhost:${PORT}/play`);
      console.log(`  Operator Console  http://localhost:${PORT}/ops`);
      console.log(`  Ops key           ${OPS_KEY}`);
      console.log(`  Data              ${DATA_ROOT}`);
      console.log("");
      console.log("  On the venue LAN, share http://<your-ip>:" + PORT + "/play with the table.");
      console.log("");
      resolve();
    });
  });

  return {
    port: PORT,
    async close() {
      for (const actor of rooms.values()) await actor.shutdown();
      rooms.clear();
      wss.close();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}

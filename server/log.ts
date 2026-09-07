/**
 * Append-only event log + snapshot engine.
 *
 * Blueprint §2.3: "Every event is appended to session_events BEFORE fan-out.
 * The log IS the observability system and the replay/debug tool."
 *
 * M0 storage: one JSONL file per room (DECISIONS #1 — Postgres deferred to M1;
 * the write path is isolated here so the swap is one file).
 * Snapshot cadence: every 100 events or 60 s, whichever first (§6.2 room_snapshots).
 * Cold restart: hydrate(snapshot) + replay(tail) — target < 3 s (§2.2.1).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { EventEnvelope } from "./contracts.js";

const SNAPSHOT_EVERY_EVENTS = 100;
const SNAPSHOT_EVERY_MS = 60_000;

export class RoomLog {
  private dir: string;
  private eventsPath: string;
  private snapshotPath: string;
  private writeChain: Promise<void> = Promise.resolve();
  private eventsSinceSnapshot = 0;
  private lastSnapshotAt = Date.now();

  constructor(dataRoot: string, roomId: string) {
    this.dir = path.join(dataRoot, "rooms", roomId);
    this.eventsPath = path.join(this.dir, "events.jsonl");
    this.snapshotPath = path.join(this.dir, "snapshot.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  /** Serialized append — resolves only when the line is on disk. */
  append(evt: EventEnvelope): Promise<void> {
    const line = JSON.stringify(evt) + "\n";
    this.writeChain = this.writeChain.then(() =>
      fs.appendFile(this.eventsPath, line, "utf8"),
    );
    this.eventsSinceSnapshot++;
    return this.writeChain;
  }

  shouldSnapshot(): boolean {
    return (
      this.eventsSinceSnapshot >= SNAPSHOT_EVERY_EVENTS ||
      Date.now() - this.lastSnapshotAt >= SNAPSHOT_EVERY_MS
    );
  }

  async writeSnapshot(seq: number, state: unknown): Promise<void> {
    const tmp = this.snapshotPath + ".tmp";
    try {
      await fs.writeFile(tmp, JSON.stringify({ seq, state }), "utf8");
      await fs.rename(tmp, this.snapshotPath);
      this.eventsSinceSnapshot = 0;
      this.lastSnapshotAt = Date.now();
    } catch (err) {
      // data dir removed mid-shutdown (or transient FS error): don't crash the actor.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async readSnapshot(): Promise<{ seq: number; state: unknown } | null> {
    try {
      const raw = await fs.readFile(this.snapshotPath, "utf8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Replay events with seq > afterSeq, in order. Tolerates a torn final line. */
  async replay(afterSeq: number): Promise<EventEnvelope[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.eventsPath, "utf8");
    } catch {
      return [];
    }
    const out: EventEnvelope[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line) as EventEnvelope;
        if (evt.seq > afterSeq) out.push(evt);
      } catch {
        /* torn tail line from a crash mid-write — replay stops cleanly before it */
      }
    }
    out.sort((a, b) => a.seq - b.seq);
    return out;
  }

  /** Tail for the operator console. */
  async tail(n: number): Promise<EventEnvelope[]> {
    const all = await this.replay(-1);
    return all.slice(-n);
  }
}

export async function listRoomIds(dataRoot: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(dataRoot, "rooms"), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * HMAC compact room tickets.
 *
 * Blueprint §6.3: `POST /rooms/:id/ticket` → short-lived WS credential.
 * M0 uses a compact HMAC ticket instead of a full JWT stack (DECISIONS #4):
 * same security property (server-signed, expiring, room+uid bound), zero deps.
 *
 * Format:  v1.<room_id>.<uid>.<exp_epoch_s>.<base64url(hmac-sha256)>
 * Verification is a room-entry precondition checked at LOBBY and invisible
 * afterward — "Trust, Silent". No identity surfaces ever appear in the room.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

let SECRET: Buffer | null = null;

export async function initSecret(dataRoot: string): Promise<void> {
  const p = path.join(dataRoot, "ticket.secret");
  try {
    SECRET = Buffer.from((await fs.readFile(p, "utf8")).trim(), "hex");
  } catch {
    SECRET = randomBytes(32);
    await fs.mkdir(dataRoot, { recursive: true });
    await fs.writeFile(p, SECRET.toString("hex"), { mode: 0o600 });
  }
}

function sign(body: string): string {
  if (!SECRET) throw new Error("ticket secret not initialized");
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

export function issueTicket(roomId: string, uid: string, ttlSeconds = 6 * 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `v1.${roomId}.${uid}.${exp}`;
  return `${body}.${sign(body)}`;
}

export function verifyTicket(
  ticket: string,
  roomId: string,
): { ok: true; uid: string } | { ok: false; reason: string } {
  const parts = ticket.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return { ok: false, reason: "malformed" };
  const [, room, uid, expStr, sig] = parts;
  if (room !== roomId) return { ok: false, reason: "wrong_room" };
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  const expected = sign(`v1.${room}.${uid}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  return { ok: true, uid };
}

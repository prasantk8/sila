/**
 * Content: prompt packs + the fallback line library.
 *
 * Lines follow Appendix B verbatim: keyed `(master_state).(beat)[.qualifier]`,
 * ≥3 variants, `{slot}` substitution. In M0 this library is not a fallback —
 * it IS Rawi. The operator fires these lines by hand; M2 puts the CTA in front
 * of the same registry, so nothing here is throwaway.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Mechanic } from "./contracts.js";

export interface Prompt {
  prompt_id: string;
  body: { title: string; text: string; choices?: string[]; cue?: string; cues?: string[] };
  answer_key?: { correct_choice?: number; accept?: string[] };
  difficulty: "LOW" | "MED" | "HIGH";
  about_uid?: string; // WHOSE_IS_THIS prompts built live from the vault
}

export interface Pack {
  pack_id: string;
  title: string;
  phase: "A" | "B" | "C" | "D" | "E";
  mechanic: Mechanic;
  culture_tags: string[];
  timer_s_default: number;
  prompts: Prompt[];
}

export interface LineEntry {
  key: string;
  variants: string[];
  tts_prerendered?: boolean;
  est_s?: number;
}

export class ContentStore {
  packs = new Map<string, Pack>();
  lines = new Map<string, LineEntry>();

  async load(contentDir: string): Promise<void> {
    const packsRaw = await fs.readFile(path.join(contentDir, "packs.json"), "utf8");
    for (const p of JSON.parse(packsRaw) as Pack[]) this.packs.set(p.pack_id, p);
    const linesRaw = await fs.readFile(path.join(contentDir, "lines.json"), "utf8");
    for (const l of JSON.parse(linesRaw) as LineEntry[]) this.lines.set(l.key, l);
  }

  getPrompt(packId: string, promptId: string): { pack: Pack; prompt: Prompt } | null {
    const pack = this.packs.get(packId);
    if (!pack) return null;
    const prompt = pack.prompts.find((p) => p.prompt_id === promptId);
    return prompt ? { pack, prompt } : null;
  }

  /** Pick a variant (rotating on a per-key counter) and fill {slots}. */
  private counters = new Map<string, number>();
  renderLine(key: string, slots: Record<string, string> = {}): { line_id: string; text: string; est_s: number } | null {
    const entry = this.lines.get(key);
    if (!entry || entry.variants.length === 0) return null;
    const n = this.counters.get(key) ?? 0;
    this.counters.set(key, n + 1);
    const raw = entry.variants[n % entry.variants.length];
    const text = fillSlots(raw, slots);
    return { line_id: `${key}#${n % entry.variants.length}`, text, est_s: entry.est_s ?? estimateSeconds(text) };
  }

  /** Coverage check per Appendix B: every key must carry ≥ 3 variants. */
  coverageWarnings(): string[] {
    const out: string[] = [];
    for (const [key, entry] of this.lines) {
      if (entry.variants.length < 3) out.push(`line "${key}" has ${entry.variants.length} variants (< 3)`);
    }
    return out;
  }
}

export function fillSlots(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => slots[k] ?? `{${k}}`);
}

/** ~2.6 words/second at Rawi pace; capped by line_max_s at fire time. */
export function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1.5, Math.round((words / 2.6) * 10) / 10);
}

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Delivery } from "./types.ts";

/**
 * The append-only record of deliveries, one JSON object per line. An
 * (item, target) pair with a "posted" or "seeded" line is done and never
 * posted again; a "failed" line is history only, so the next run retries.
 */
export class Ledger {
  readonly path: string;
  private done = new Set<string>();

  constructor(path: string) {
    this.path = path;
    if (!existsSync(path)) return;
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .forEach((line, n) => {
        let d: Delivery;
        try {
          d = JSON.parse(line);
        } catch {
          throw new Error(`${path}:${n + 1}: not JSON`);
        }
        if (d.status === "posted" || d.status === "seeded") this.done.add(key(d.item, d.target));
      });
  }

  delivered(item: string, target: string): boolean {
    return this.done.has(key(item, target));
  }

  append(d: Omit<Delivery, "at"> & { at?: string }): Delivery {
    const line: Delivery = { ...d, at: d.at ?? new Date().toISOString() };
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify(line) + "\n");
    if (line.status === "posted" || line.status === "seeded") this.done.add(key(line.item, line.target));
    return line;
  }
}

const key = (item: string, target: string) => `${target}\u0000${item}`;

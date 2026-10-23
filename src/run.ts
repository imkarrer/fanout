import { type Config, enabledTargets } from "./config.ts";
import { Ledger } from "./ledger.ts";
import { DEFAULT_TEMPLATE, render } from "./render.ts";
import { TARGETS } from "./targets/index.ts";
import type { Delivery, Env, Fetch, Item } from "./types.ts";

/** One post that has not happened yet: an item, a target, and the message it would get. */
export interface Pending {
  item: Item;
  target: string;
  type: string;
  message: string;
}

/** Every (item, target) pair the ledger has not seen, oldest item first. */
export function plan(config: Config, items: Item[], ledger: Ledger): Pending[] {
  const ordered = [...items].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const out: Pending[] = [];
  for (const item of ordered)
    for (const [name, t] of enabledTargets(config)) {
      if (ledger.delivered(item.id, name)) continue;
      out.push({ item, target: name, type: t.type, message: render(t.template ?? DEFAULT_TEMPLATE, item) });
    }
  return out;
}

/** Targets that cannot post live as configured, with the reasons. */
export function problems(config: Config, env: Env): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, t] of enabledTargets(config)) {
    const p = TARGETS[t.type].check(t, env);
    if (p.length) out[name] = p;
  }
  return out;
}

/**
 * Post every pending delivery and record each outcome. One failure never
 * stops the rest; it is recorded as "failed" and retried on the next run.
 */
export async function deliver(config: Config, pending: Pending[], ledger: Ledger, env: Env, fetchFn: Fetch): Promise<Delivery[]> {
  const results: Delivery[] = [];
  for (const p of pending) {
    const cfg = config.targets[p.target];
    try {
      const posted = await TARGETS[p.type].post(p.item, cfg, { name: p.target, message: p.message, env, fetch: fetchFn });
      results.push(ledger.append({ item: p.item.id, target: p.target, status: "posted", remote: posted.remote }));
    } catch (e) {
      results.push(ledger.append({ item: p.item.id, target: p.target, status: "failed", error: (e as Error).message }));
    }
  }
  return results;
}

/** Mark every pending delivery done without posting: for adopting fanout on a site with history. */
export function seed(pending: Pending[], ledger: Ledger): Delivery[] {
  return pending.map((p) => ledger.append({ item: p.item.id, target: p.target, status: "seeded" }));
}

import type { TargetConfig } from "../config.ts";
import type { Env, Fetch, Item, Posted } from "../types.ts";
import { discord } from "./discord.ts";
import { slack } from "./slack.ts";

/** What every adapter is handed besides the item. */
export interface Context {
  name: string;
  message: string;
  env: Env;
  fetch: Fetch;
}

export interface Target {
  /** Problems that would stop a live post (a missing secret, a missing setting); empty when ready. */
  check(cfg: TargetConfig, env: Env): string[];
  post(item: Item, cfg: TargetConfig, ctx: Context): Promise<Posted>;
}

const notYet = (bead: string): Target => ({
  check: () => [`this target type is not implemented yet (${bead})`],
  post: async () => {
    throw new Error(`not implemented yet (${bead})`);
  },
});

export const TARGETS: Record<string, Target> = {
  discord,
  slack,
  "facebook-page": notYet("facebook-page adapter"),
  "facebook-group": notYet("facebook-group adapter"),
};

/** The secret a target names, e.g. webhook_env: "DISCORD_WEBHOOK_URL". */
export function secret(cfg: TargetConfig, field: string, env: Env): { name?: string; value?: string } {
  const name = cfg[field];
  if (typeof name !== "string" || !name) return {};
  return { name, value: env[name] || undefined };
}

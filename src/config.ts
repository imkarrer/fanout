import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * A project's fanout.json. The tool holds no content and no secrets: the
 * config names the source, the ledger and the targets, and each target names
 * the environment variables that hold its secrets.
 *
 * {
 *   "source": { "type": "jsonfeed", "url": "https://example.org/announce.json" },
 *   "ledger": "fanout-ledger/deliveries.jsonl",
 *   "targets": {
 *     "club-discord": { "type": "discord", "webhook_env": "DISCORD_WEBHOOK_URL" },
 *     "team-slack": { "type": "slack", "webhook_env": "SLACK_WEBHOOK_URL",
 *                     "template": "{title}: {url}" }
 *   }
 * }
 */
export interface SourceConfig {
  type: "jsonfeed";
  /** An http(s) URL or a file path (relative to the config file). */
  url: string;
}

export interface TargetConfig {
  type: string;
  /** Message template; placeholders {title} {summary} {text} {url} {kind}. */
  template?: string;
  /** false skips the target without deleting it. Default true. */
  enabled?: boolean;
  [key: string]: unknown;
}

export interface Config {
  source: SourceConfig;
  ledger: string;
  targets: Record<string, TargetConfig>;
  /** Directory the config was read from; relative paths resolve against it. */
  base: string;
}

export const TARGET_TYPES = ["discord", "slack", "facebook-page", "facebook-group"] as const;

export class ConfigError extends Error {}

export function parseConfig(raw: unknown, base: string): Config {
  const fail = (msg: string): never => {
    throw new ConfigError(`fanout.json: ${msg}`);
  };
  if (typeof raw !== "object" || raw === null) fail("must be a JSON object");
  const c = raw as Record<string, unknown>;
  const source = c.source as Record<string, unknown> | undefined;
  if (!source || source.type !== "jsonfeed") fail('source.type must be "jsonfeed"');
  if (typeof source!.url !== "string" || !source!.url) fail("source.url is required");
  if (typeof c.ledger !== "string" || !c.ledger) fail("ledger (a file path) is required");
  const targets = c.targets as Record<string, TargetConfig> | undefined;
  if (!targets || typeof targets !== "object" || Object.keys(targets).length === 0)
    fail("targets must name at least one target");
  for (const [name, t] of Object.entries(targets!)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(`target name "${name}": use lowercase letters, digits and -`);
    if (!(TARGET_TYPES as readonly string[]).includes(t?.type))
      fail(`targets.${name}.type "${t?.type}" is not one of ${TARGET_TYPES.join(", ")}`);
    if (t.template !== undefined && typeof t.template !== "string") fail(`targets.${name}.template must be text`);
  }
  return {
    source: { type: "jsonfeed", url: source!.url as string },
    ledger: resolve(base, c.ledger as string),
    targets: targets!,
    base,
  };
}

export function loadConfig(path: string): Config {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new ConfigError(`${path}: ${(e as Error).message}`);
  }
  return parseConfig(raw, dirname(resolve(path)));
}

/** The enabled targets, in config order. */
export function enabledTargets(config: Config): [string, TargetConfig][] {
  return Object.entries(config.targets).filter(([, t]) => t.enabled !== false);
}

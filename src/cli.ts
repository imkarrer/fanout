#!/usr/bin/env node
import { parseArgs } from "node:util";
import { ConfigError, enabledTargets, loadConfig } from "./config.ts";
import { loadFeed } from "./feed.ts";
import { Ledger } from "./ledger.ts";
import { deliver, plan, problems, seed } from "./run.ts";

const USAGE = `fanout: announce what a site publishes, everywhere it should go.

  fanout plan            what would be posted, and where (default; changes nothing)
  fanout run             the same, but only says what it would do...
  fanout run --live      ...until --live: post, and record each delivery
  fanout seed            record everything pending as done without posting
                         (run once when adopting fanout on a site with history)
  fanout targets         each target and whether it could post live right now

Options:
  --config FILE   the project's fanout.json (default ./fanout.json)
  --source URL    read this feed instead of the config's source (a URL or file)
  --ledger FILE   use this ledger instead of the config's
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: "string", default: "fanout.json" },
      source: { type: "string" },
      ledger: { type: "string" },
      live: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const cmd = positionals[0] ?? "plan";
  if (values.help || !["plan", "run", "seed", "targets"].includes(cmd)) {
    process.stdout.write(USAGE);
    return values.help ? 0 : 2;
  }
  const config = loadConfig(values.config!);
  if (values.ledger) config.ledger = values.ledger;
  const env = process.env;

  if (cmd === "targets") {
    const p = problems(config, env);
    for (const [name, t] of enabledTargets(config))
      console.log(`${p[name] ? "✗" : "✓"} ${name} (${t.type})${p[name] ? ": " + p[name].join("; ") : ""}`);
    return Object.keys(p).length ? 1 : 0;
  }

  const items = await loadFeed(values.source ?? config.source.url, config.base);
  const ledger = new Ledger(config.ledger);
  const pending = plan(config, items, ledger);
  console.log(`${items.length} item(s) marked to announce; ${pending.length} delivery(ies) pending.`);
  if (pending.length === 0) return 0;

  if (cmd === "seed") {
    seed(pending, ledger);
    console.log(`seeded ${pending.length}: recorded as done, nothing posted.`);
    return 0;
  }
  for (const p of pending) console.log(`\n→ ${p.target} (${p.type}) · ${p.item.id}\n${indent(p.message)}`);
  if (cmd === "plan" || !values.live) {
    if (cmd === "run") console.log("\ndry run: nothing posted. Add --live to post.");
    return 0;
  }

  const p = problems(config, env);
  const blocked = pending.filter((x) => p[x.target]);
  for (const name of new Set(blocked.map((x) => x.target))) console.error(`✗ ${name}: ${p[name].join("; ")}`);
  const results = await deliver(config, pending.filter((x) => !p[x.target]), ledger, env, fetch);
  for (const r of results)
    console.log(`${r.status === "posted" ? "✓" : "✗"} ${r.target} · ${r.item}${r.remote ? " · " + r.remote : ""}${r.error ? " · " + r.error : ""}`);
  return results.some((r) => r.status === "failed") || blocked.length ? 1 : 0;
}

const indent = (s: string) => s.split("\n").map((l) => "    " + l).join("\n");

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof ConfigError ? e.message : `fanout: ${(e as Error).message}`);
    process.exit(2);
  },
);

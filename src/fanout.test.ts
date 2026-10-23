import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ConfigError, parseConfig } from "./config.ts";
import { itemsFromFeed } from "./feed.ts";
import { Ledger } from "./ledger.ts";
import { render } from "./render.ts";
import { deliver, plan, problems, seed } from "./run.ts";
import type { Context } from "./targets/index.ts";
import { facebookGroup, loadPlaywright, postToPage, type FacebookPage } from "./targets/facebook-group.ts";
import type { Fetch } from "./types.ts";
import { facebookPage } from "./targets/facebook-page.ts";

const DISCORD = "https://discord.com/api/webhooks/1/abc";
const SLACK = "https://hooks.slack.com/services/T/B/x";

const feed = (items: object[]) => ({ version: "https://jsonfeed.org/version/1.1", title: "t", items });
const item = (id: string, announce: boolean | undefined, extra: object = {}) => ({
  id,
  url: `https://site.example/${id}/`,
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  date_published: `2026-0${id.length}-01`,
  ...(announce === undefined ? {} : { _fanout: { announce } }),
  ...extra,
});

function setup(targets: object = { d: { type: "discord", webhook_env: "D" }, s: { type: "slack", webhook_env: "S" } }) {
  const dir = mkdtempSync(join(tmpdir(), "fanout-"));
  const config = parseConfig({ source: { type: "jsonfeed", url: "feed.json" }, ledger: "ledger.jsonl", targets }, dir);
  return { dir, config, ledger: new Ledger(config.ledger) };
}

/** A fetch that records each request and answers like the target would. */
function fakeFetch(fail: string[] = []) {
  const calls: { url: string; body: any }[] = [];
  const fn: Fetch = async (input, init) => {
    const url = String(input);
    // Handle URL-encoded bodies for facebook-page
    let body: any = {};
    if (init?.body) {
      const bodyString = String(init.body);
      if (bodyString.startsWith("message=")) {
        // URL-encoded body - parse it
        const params = new URLSearchParams(bodyString);
        body = {};
        for (const [key, value] of params.entries()) {
          body[key] = value;
        }
      } else {
        // JSON body
        body = JSON.parse(bodyString);
      }
    }
    calls.push({ url, body });
    if (fail.some((f) => url.startsWith(f))) return new Response("nope", { status: 500 });
    if (url.startsWith(DISCORD)) return Response.json({ id: "m1", channel_id: "c1" });
    if (url.startsWith("https://graph.facebook.com/")) return Response.json({ id: "xyz" });
    return new Response("ok");
  };
  return { fn, calls };
}

test("only items the feed marks announce: true are announced", () => {
  const items = itemsFromFeed(feed([item("a", true), item("b", false), item("c", undefined)]));
  assert.deepEqual(items.map((i) => i.id), ["a"]);
});

test("a document that is not a JSON Feed is rejected", () => {
  assert.throws(() => itemsFromFeed({ items: [] }), /not a JSON Feed/);
});

test("render: the editor's text wins; without it, title and summary", () => {
  const [withText] = itemsFromFeed(feed([item("a", true, { _fanout: { announce: true, text: "Custom words" } })]));
  const [plain] = itemsFromFeed(feed([item("b", true)]));
  assert.equal(render("{text}\n{url}", withText), "Custom words\nhttps://site.example/a/");
  assert.equal(render("{text}", plain), "Title b: Summary b");
});

test("render: a typo'd placeholder is an error, not posted text", () => {
  const [i] = itemsFromFeed(feed([item("a", true)]));
  assert.throws(() => render("{tilte}", i), /\{tilte\} is not one of/);
});

test("config: an unknown target type is rejected with its name", () => {
  assert.throws(() => setup({ x: { type: "myspace" } }), (e: Error) => e instanceof ConfigError && /targets\.x\.type/.test(e.message));
});

test("plan: every ticked item once per target; a disabled target is skipped", () => {
  const { config, ledger } = setup({ d: { type: "discord" }, s: { type: "slack", enabled: false } });
  const p = plan(config, itemsFromFeed(feed([item("a", true), item("bb", true)])), ledger);
  assert.deepEqual(p.map((x) => `${x.target}:${x.item.id}`), ["d:a", "d:bb"]);
});

test("deliver posts once; a second run finds nothing pending", async () => {
  const { config, ledger } = setup();
  const env = { D: DISCORD, S: SLACK };
  const items = itemsFromFeed(feed([item("a", true)]));
  const f = fakeFetch();
  const r = await deliver(config, plan(config, items, ledger), ledger, env, f.fn);
  assert.deepEqual(r.map((x) => x.status), ["posted", "posted"]);
  assert.equal(r[0].remote, "discord:c1/m1");
  const reread = new Ledger(config.ledger);
  assert.equal(plan(config, items, reread).length, 0);
});

test("the exact payloads: Discord pings nobody; Slack unfurls the link", async () => {
  const { config, ledger } = setup();
  const f = fakeFetch();
  await deliver(config, plan(config, itemsFromFeed(feed([item("a", true)])), ledger), ledger, { D: DISCORD, S: SLACK }, f.fn);
  assert.equal(f.calls[0].url, `${DISCORD}?wait=true`);
  assert.deepEqual(f.calls[0].body, { content: "Title a: Summary a\nhttps://site.example/a/", allowed_mentions: { parse: [] } });
  assert.deepEqual(f.calls[1].body, { text: "Title a: Summary a\nhttps://site.example/a/", unfurl_links: true });
});

test("a failure is recorded, does not stop the others, and is retried next run", async () => {
  const { config, ledger } = setup();
  const env = { D: DISCORD, S: SLACK };
  const items = itemsFromFeed(feed([item("a", true)]));
  const r = await deliver(config, plan(config, items, ledger), ledger, env, fakeFetch([DISCORD]).fn);
  assert.deepEqual(r.map((x) => `${x.target}:${x.status}`), ["d:failed", "s:posted"]);
  assert.deepEqual(plan(config, items, new Ledger(config.ledger)).map((x) => x.target), ["d"]);
});

test("seed records everything as done without a single request", () => {
  const { config, ledger } = setup();
  const items = itemsFromFeed(feed([item("a", true), item("bb", true)]));
  seed(plan(config, items, ledger), ledger);
  assert.equal(plan(config, items, new Ledger(config.ledger)).length, 0);
  const lines = readFileSync(config.ledger, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(lines.every((l) => l.status === "seeded"));
});

test("problems: a missing or malformed secret blocks a target, by name", () => {
  const { config } = setup();
  assert.deepEqual(problems(config, {}), { d: ["D is not set"], s: ["S is not set"] });
  assert.match(problems(config, { D: "https://example.com", S: SLACK }).d[0], /does not look like a Discord webhook/);
  assert.deepEqual(problems(config, { D: DISCORD, S: SLACK }), {});
});

test("the ledger survives a corrupt line by naming it", () => {
  const { config } = setup();
  writeFileSync(config.ledger, '{"item":"a","target":"d","status":"posted","at":"x"}\nnot json\n');
  assert.throws(() => new Ledger(config.ledger), /ledger\.jsonl:2: not JSON/);
});

/** A fake page: no browser, just a record of what was asked of it. */
function fakePage(opts: { signedIn?: boolean; posted?: boolean } = {}) {
  const calls: string[] = [];
  let filled = "";
  const page: FacebookPage = {
    async open(url) {
      calls.push(`open:${url}`);
    },
    async isSignedIn() {
      return opts.signedIn ?? true;
    },
    async fill(message) {
      calls.push("fill");
      filled = message;
    },
    async clickPost() {
      calls.push("clickPost");
    },
    async waitForPosted() {
      calls.push("waitForPosted");
      return opts.posted ?? true;
    },
    async close() {
      calls.push("close");
    },
  };
  return { page, calls, filled: () => filled };
}

const fbCtx: Context = { name: "g", message: "Hello group", env: {}, fetch: fetch as Fetch };

test("facebook-group: assist mode fills the message and waits, without clicking Post", async () => {
  const { page, calls } = fakePage();
  await postToPage(page, { type: "facebook-group", group_url: "https://www.facebook.com/groups/1" }, fbCtx);
  assert.deepEqual(calls, ["open:https://www.facebook.com/groups/1", "fill", "waitForPosted", "close"]);
});

test("facebook-group: auto mode clicks Post", async () => {
  const { page, calls, filled } = fakePage();
  await postToPage(page, { type: "facebook-group", group_url: "https://www.facebook.com/groups/1", mode: "auto" }, fbCtx);
  assert.deepEqual(calls, ["open:https://www.facebook.com/groups/1", "fill", "clickPost", "waitForPosted", "close"]);
  assert.equal(filled(), "Hello group");
});

test("facebook-group: a timeout waiting for Post is an error", async () => {
  const { page } = fakePage({ posted: false });
  await assert.rejects(
    postToPage(page, { type: "facebook-group", group_url: "https://www.facebook.com/groups/1" }, fbCtx),
    /timed out waiting for Post/,
  );
});

test("facebook-group: a signed-out page throws, never typing credentials", async () => {
  const { page, calls } = fakePage({ signedIn: false });
  await assert.rejects(
    postToPage(page, { type: "facebook-group", group_url: "https://www.facebook.com/groups/1" }, fbCtx),
    /not signed in: run fanout login <target> first/,
  );
  assert.deepEqual(calls, ["open:https://www.facebook.com/groups/1", "close"]);
});

test("facebook-group: a missing Playwright throws the install hint", async () => {
  await assert.rejects(
    loadPlaywright(() => Promise.reject(new Error("Cannot find module 'playwright'"))),
    /facebook-group needs Playwright: npm install playwright && npx playwright install chromium/,
  );
});

test("facebook-group: check() rejects a group_url that isn't a facebook.com group", () => {
  assert.deepEqual(facebookGroup.check({ type: "facebook-group", group_url: "https://example.com/groups/1" }, {}), [
    "group_url must be a facebook.com/groups/... URL",
  ]);
  assert.deepEqual(
    facebookGroup.check({ type: "facebook-group", group_url: "https://www.facebook.com/groups/1" }, {}),
    [],
  );
});

test("facebook-page: check() validates page_id and token_env", () => {
  // Valid configuration
  assert.deepEqual(
    facebookPage.check({ type: "facebook-page", page_id: "123", token_env: "FB_PAGE_TOKEN" }, { FB_PAGE_TOKEN: "token123" }),
    [],
  );
  
  // Invalid page_id - empty string
  assert.deepEqual(
    facebookPage.check({ type: "facebook-page", page_id: "", token_env: "FB_PAGE_TOKEN" }, { FB_PAGE_TOKEN: "token123" }),
    ["page_id must be a non-empty string"],
  );
  
  // Invalid page_id - not digits
  assert.deepEqual(
    facebookPage.check({ type: "facebook-page", page_id: "abc", token_env: "FB_PAGE_TOKEN" }, { FB_PAGE_TOKEN: "token123" }),
    ["page_id must be a string of digits"],
  );
  
  // Invalid token_env - not set
  assert.deepEqual(
    facebookPage.check({ type: "facebook-page", page_id: "123", token_env: "FB_PAGE_TOKEN" }, {}),
    ["FB_PAGE_TOKEN is not set"],
  );
  
  // Invalid token_env - missing variable name
  assert.deepEqual(
    facebookPage.check({ type: "facebook-page", page_id: "123", token_env: "" }, {}),
    ["set token_env to the name of the environment variable holding the access token"],
  );
});

test("facebook-page: posts with correct URL and body", async () => {
  const { config, ledger } = setup({ fb: { type: "facebook-page", page_id: "123", token_env: "FB_PAGE_TOKEN" } });
  const f = fakeFetch();
  const env = { FB_PAGE_TOKEN: "token123" };
  const items = itemsFromFeed(feed([item("a", true)]));
  await deliver(config, plan(config, items, ledger), ledger, env, f.fn);
  
  // Check URL
  assert.equal(f.calls[0].url, "https://graph.facebook.com/v23.0/123/feed");
  
  // Check body has exactly message, link, access_token
  const body = f.calls[0].body;
  assert.equal(body.message, "Title a: Summary a\nhttps://site.example/a/");
  assert.equal(body.link, "https://site.example/a/");
  assert.equal(body.access_token, "token123");
  assert.equal(Object.keys(body).length, 3); // Only these three fields
});

test("facebook-page: uses api_version when specified", async () => {
  const { config, ledger } = setup({ fb: { type: "facebook-page", page_id: "123", token_env: "FB_PAGE_TOKEN", api_version: "v17.0" } });
  const f = fakeFetch();
  const env = { FB_PAGE_TOKEN: "token123" };
  const items = itemsFromFeed(feed([item("a", true)]));
  await deliver(config, plan(config, items, ledger), ledger, env, f.fn);
  
  // Check URL with custom API version
  assert.equal(f.calls[0].url, "https://graph.facebook.com/v17.0/123/feed");
});



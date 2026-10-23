import type { Target } from "./index.ts";
import { secret } from "./index.ts";

/**
 * A Slack incoming webhook (an app with Incoming Webhooks turned on, added to
 * the channel). Config: { "type": "slack", "webhook_env": "SLACK_WEBHOOK_URL" }.
 * Posts the message as text and lets Slack unfurl the link.
 */
export const slack: Target = {
  check(cfg, env) {
    const s = secret(cfg, "webhook_env", env);
    if (!s.name) return ["set webhook_env to the name of the environment variable holding the webhook URL"];
    if (!s.value) return [`${s.name} is not set`];
    if (!s.value.startsWith("https://hooks.slack.com/")) return [`${s.name} does not look like a Slack webhook URL`];
    return [];
  },
  async post(_item, cfg, ctx) {
    const url = secret(cfg, "webhook_env", ctx.env).value!;
    const res = await ctx.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: ctx.message, unfurl_links: true }),
    });
    const text = await res.text();
    if (!res.ok || text.trim() !== "ok") throw new Error(`Slack HTTP ${res.status}: ${text.slice(0, 200)}`);
    return {};
  },
};

import type { Target } from "./index.ts";
import { secret } from "./index.ts";

/**
 * A Discord channel webhook (Channel settings -> Integrations -> Webhooks).
 * Config: { "type": "discord", "webhook_env": "DISCORD_WEBHOOK_URL", "username"?: "CVSCC" }.
 * Posts the message as plain content; Discord builds the link preview from
 * the page's own og: tags. Mentions are disabled so a stray "@everyone" in an
 * announcement can't ping a server.
 */
export const discord: Target = {
  check(cfg, env) {
    const s = secret(cfg, "webhook_env", env);
    if (!s.name) return ["set webhook_env to the name of the environment variable holding the webhook URL"];
    if (!s.value) return [`${s.name} is not set`];
    if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(s.value))
      return [`${s.name} does not look like a Discord webhook URL`];
    return [];
  },
  async post(item, cfg, ctx) {
    const url = secret(cfg, "webhook_env", ctx.env).value!;
    const body: Record<string, unknown> = { content: ctx.message.slice(0, 2000), allowed_mentions: { parse: [] } };
    if (typeof cfg.username === "string") body.username = cfg.username;
    const res = await ctx.fetch(`${url}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Discord HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const msg = (await res.json()) as { id?: string; channel_id?: string };
    return { remote: msg.id ? `discord:${msg.channel_id}/${msg.id}` : undefined };
  },
};

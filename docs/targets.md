# Setting up targets

This document explains how to set up each target type for fanout.

## Discord

1. In your Discord server, go to **Server Settings** → **Integrations**.
2. Click **Webhooks** and then **New Webhook**.
3. Copy the URL.
4. Add to `fanout.json`:

```json
"club-discord": {
  "type": "discord",
  "webhook_env": "DISCORD_WEBHOOK_URL",
  "template": "📣 {text}\n{url}"
}
```

5. Set the environment variable:

```bash
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

6. Confirm with:

```bash
fanout targets
```

## Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create an app.
2. Enable **Incoming Webhooks**.
3. Add a webhook to the channel.
4. Copy the URL.
5. Add to `fanout.json`:

```json
"team-slack": {
  "type": "slack",
  "webhook_env": "SLACK_WEBHOOK_URL"
}
```

6. Set the environment variable:

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
```

7. Confirm with:

```bash
fanout targets
```

## Facebook page

1. Create a [Meta app](https://developers.facebook.com/) with the permissions `pages_manage_posts` and `pages_read_engagement`.
2. Generate a long-lived user access token.
3. Exchange it for a page access token.
4. Get the page ID from the page's **About** section.
5. Add to `fanout.json`:

```json
"club-page": {
  "type": "facebook-page",
  "page_id": "123456789",
  "token_env": "FB_PAGE_TOKEN"
}
```

6. Set the environment variable:

```bash
export FB_PAGE_TOKEN="..."
```

7. Confirm with:

```bash
fanout targets
```

> Note: Check Meta's current documentation for the exact menu locations, as they may have changed.

## Facebook group

1. Install Playwright:

```bash
npm install playwright
npx playwright install chromium
```

2. Sign in to the group using your browser profile:

```bash
fanout login club-group
```

3. No environment variables are needed.
4. Add to `fanout.json`:

```json
"club-group": {
  "type": "facebook-group",
  "group_url": "https://www.facebook.com/groups/...",
  "mode": "assist"
}
```

5. Confirm with:

```bash
fanout targets
```

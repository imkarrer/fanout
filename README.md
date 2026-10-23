# fanout

`fanout` announces what a site publishes, everywhere it should go. The site
is the source of truth: an editor ticks "Announce" on a post, the site
publishes, and `fanout` posts it to Discord, Slack and Facebook, once each,
with a link back.

Built and distributed with [Flox](https://flox.dev), like
[brag](https://github.com/imkarrer/brag); posts video the way
[fugazy-publish](https://github.com/imkarrer/fugazy-publish) does, but for
links and text.

## Install

```bash
flox install imkarrer/fanout
```

Without Flox: `fanout` is plain TypeScript, run natively by Node.js 23.6+:
`node src/cli.ts --help`.

## How it works

1. **The site publishes a [JSON Feed](https://jsonfeed.org/version/1.1)** and
   marks the items to announce with a small extension:
   `"_fanout": { "announce": true, "text": "optional custom wording", "kind": "news" }`.
   Unmarked items are ignored, so one feed serves readers and fanout alike.
2. **The project's `fanout.json`** names that feed, the ledger, and each
   target. Secrets are never in it: a target names the environment variable
   that holds its webhook or token.
3. **`fanout run --live`** posts every (item, target) pair the **ledger** has
   not seen, then records it. The ledger is append-only JSONL, so re-running
   is always safe and a failed post is retried next time.

```json
{
  "source": { "type": "jsonfeed", "url": "https://www.cvscc.org/announce.json" },
  "ledger": "fanout-ledger/deliveries.jsonl",
  "targets": {
    "club-discord": { "type": "discord", "webhook_env": "DISCORD_WEBHOOK_URL",
                      "template": "📣 {text}\n{url}" },
    "team-slack":   { "type": "slack", "webhook_env": "SLACK_WEBHOOK_URL" },
    "club-page":    { "type": "facebook-page", "page_id": "123", "token_env": "FB_PAGE_TOKEN" },
    "club-group":   { "type": "facebook-group", "group_url": "https://www.facebook.com/groups/…",
                      "mode": "assist" }
  }
}
```

Templates fill `{title}` `{summary}` `{text}` `{url}` `{kind}` `{date}`;
`{text}` is the editor's wording, else "title: summary". The default is
`{text}\n{url}`. A misspelt placeholder fails the dry run.

## Commands

```bash
fanout plan            # what would be posted, and where (changes nothing)
fanout run             # the same, as a dry run...
fanout run --live      # ...post, and record each delivery
fanout seed            # record everything pending as done, posting nothing
fanout targets         # which targets could post live right now, and why not
fanout login <target>  # sign in once in a browser target's own profile (facebook-group)
```

Adopting fanout on a site that already has posts: run `fanout seed` once,
or the first live run announces the whole back catalogue.

## Targets

| Type | Posts with | Where it runs |
| --- | --- | --- |
| `discord` | A channel webhook | Anywhere, CI included |
| `slack` | An incoming webhook | Anywhere, CI included |
| `facebook-page` | Meta's Graph API and a page token | Anywhere, CI included |
| `facebook-group` | A real browser (Playwright), signed in as a group member | A machine with that browser profile |

Facebook removed the API for posting to groups in 2024, so the group target
drives a browser. That is against Meta's terms for automated access and
can trip their spam checks, so its default `assist` mode fills in the post
and waits for a person to click Post; `auto` posts unattended at your own
risk. See [docs/adr/0003](docs/adr/0003-facebook-groups-through-a-browser.md).

See [docs/targets.md](docs/targets.md) for setup instructions for each target.

## Development

```bash
flox activate      # node
npm install        # typecheck and test dev dependencies
npm run typecheck && npm test
flox build         # -> ./result-fanout/bin/fanout
```

Vocabulary: [CONTEXT.md](CONTEXT.md). Decisions: [docs/adr/](docs/adr/).
MIT licensed.

# Vocabulary

- **Source**: where announcements come from. Today always a JSON Feed the site publishes.
- **Item**: one entry in the source marked `"_fanout": { "announce": true }`. Its `id` is stable forever; the ledger keys on it.
- **Target**: one named destination in `fanout.json` (`club-discord`), of a **type** (`discord`). Two targets may share a type.
- **Message**: what a target posts for an item: its **template** filled from the item.
- **Delivery**: one item on one target. `posted`, `seeded` (marked done without posting) or `failed` (retried next run).
- **Ledger**: the append-only JSONL file of deliveries. Never edited, only appended to.
- **Dry run**: the default. Shows every pending message, posts nothing. `--live` posts.
- **Assist mode** (`facebook-group`): the browser fills in the post and a person clicks Post.

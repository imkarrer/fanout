# 0002: An append-only JSONL ledger keyed by (item, target)

As in brag: one JSON object per line, never rewritten. A pair with a
`posted` or `seeded` line is done; `failed` lines are history and the pair is
retried. Re-running is always safe, a crash mid-run loses at most the one
post in flight, and the file diffs cleanly in git. Where it lives is the
project's choice (`ledger` in fanout.json): a CI job keeps it on a git branch
of the site repo, so recording a delivery never triggers a deploy.

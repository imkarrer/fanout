# 0001: The source is a JSON Feed the site publishes

fanout reads what the site has actually published, not the CMS, not git
history. A site emits a JSON Feed and marks the items to announce with a
`_fanout` extension. Whatever is live is what gets announced, a draft can't
leak, and any site generator (Hugo, Astro, a hand-written file) can feed it.
JSON Feed over RSS: it is JSON (no XML parser), and extensions are part of
the spec (`_`-prefixed keys).

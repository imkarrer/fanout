# Agent instructions: fanout

A CLI that posts a site's announcements to Discord, Slack and Facebook. Plain
TypeScript run directly by Node 24 (type stripping): no build, no bundler.
Vocabulary is in CONTEXT.md; decisions in docs/adr/.

## The proof

```bash
flox activate -- sh -c 'npm ci --silent && npm run typecheck && npm test'
```

CI runs exactly this. Nothing is done red.

## Rules

1. **No runtime dependencies in the core.** Everything outside
   `src/targets/facebook-group.ts` uses only Node's standard library and
   `fetch`. That adapter may import Playwright, but only with a dynamic
   `import()` inside its functions, so nothing else loads it.
2. **Node runs the source as written.** Only erasable TypeScript: no `enum`,
   no `namespace`, no parameter properties. Import local files with the
   `.ts` extension.
3. **Tests never touch the network.** Pass a fake `fetch` (see
   `src/fanout.test.ts`); never read real environment variables or secrets.
4. **A new target type** is one file in `src/targets/`, implementing `Target`
   (`check` lists what blocks a live post; `post` posts and returns where it
   landed), registered in `src/targets/index.ts` and in `TARGET_TYPES` in
   `src/config.ts`, with tests of its exact request payloads, documented in
   the README's Targets table.
5. **Never post twice.** Delivery state lives only in the ledger. Don't add
   another record of what was posted.
6. **Leave alone:** `.flox/`, `.github/`, `.beads/`, unless the bead says so.

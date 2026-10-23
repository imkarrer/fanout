import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Fetch, Item } from "./types.ts";

/**
 * Read a JSON Feed (https://jsonfeed.org/version/1.1) and return the items to
 * announce. An item is announced only when the feed marks it so, in the
 * `_fanout` extension: `"_fanout": { "announce": true, "text": "...", "kind": "news" }`.
 * Everything else in the feed is ignored, so a site can publish one feed for
 * readers and let fanout pick out the ticked items.
 */
export function itemsFromFeed(feed: unknown): Item[] {
  const f = feed as { version?: string; items?: unknown[] };
  if (!f || typeof f.version !== "string" || !f.version.startsWith("https://jsonfeed.org/version/1"))
    throw new Error("not a JSON Feed: missing version https://jsonfeed.org/version/1.x");
  const items: Item[] = [];
  for (const raw of f.items ?? []) {
    const i = raw as Record<string, unknown>;
    const ext = (i._fanout ?? {}) as Record<string, unknown>;
    if (ext.announce !== true) continue;
    const id = String(i.id ?? "");
    const url = String(i.url ?? "");
    const title = String(i.title ?? "");
    if (!id || !url || !title) throw new Error(`feed item ${JSON.stringify(id || url)} needs id, url and title`);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    items.push({
      id,
      url,
      title,
      summary: str(i.summary),
      image: str(i.image),
      date: str(i.date_published),
      text: str(ext.text),
      kind: str(ext.kind),
    });
  }
  return items;
}

export async function loadFeed(source: string, base: string, fetchFn: Fetch = fetch): Promise<Item[]> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetchFn(source, { headers: { accept: "application/feed+json, application/json" } });
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status}`);
    return itemsFromFeed(await res.json());
  }
  return itemsFromFeed(JSON.parse(readFileSync(resolve(base, source), "utf8")));
}

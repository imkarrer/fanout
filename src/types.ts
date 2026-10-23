/** One thing to announce: a post, event or result on the source site. */
export interface Item {
  /** Stable across runs; the ledger keys on it. A JSON Feed item's `id`. */
  id: string;
  url: string;
  title: string;
  summary?: string;
  image?: string;
  date?: string;
  /** The editor's own wording for the announcement, when they wrote one. */
  text?: string;
  /** What the item is (news, event, results...), for templates. */
  kind?: string;
}

/** One line of the ledger: what happened to one item on one target. */
export interface Delivery {
  item: string;
  target: string;
  status: "posted" | "seeded" | "failed";
  at: string;
  /** Where the post landed, when the target says. */
  remote?: string;
  error?: string;
}

/** What a target adapter returns after posting. */
export interface Posted {
  remote?: string;
}

export type Fetch = typeof fetch;
export type Env = Record<string, string | undefined>;

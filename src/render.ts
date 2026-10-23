import type { Item } from "./types.ts";

/** Used when a target sets no template: the editor's text (else title and summary), then the link. */
export const DEFAULT_TEMPLATE = "{text}\n{url}";

/**
 * Fill a template. Placeholders: {title} {summary} {text} {url} {kind} {date}.
 * {text} is the item's own announcement wording, falling back to
 * "title: summary". Unknown placeholders are an error, so a typo in a config
 * fails the dry run rather than posting "{tilte}" to a channel.
 */
export function render(template: string, item: Item): string {
  const values: Record<string, string> = {
    title: item.title,
    summary: item.summary ?? "",
    text: item.text ?? (item.summary ? `${item.title}: ${item.summary}` : item.title),
    url: item.url,
    kind: item.kind ?? "",
    date: item.date ?? "",
  };
  const out = template.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
    if (!(key in values)) throw new Error(`template placeholder ${whole} is not one of {${Object.keys(values).join("} {")}}`);
    return values[key];
  });
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

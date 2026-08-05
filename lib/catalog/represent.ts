import { createHash } from "node:crypto";

import type { NewCard } from "@/db/schema";

/**
 * Turn a card row into the text that gets embedded — the single decision
 * that determines what "similar" means to the vector index.
 *
 * This is deliberately plain, keyword-dense prose rather than a template like
 * "Player: X, Set: Y" — Voyage is trained on natural text, and dense natural
 * phrasing embeds better than label:value pairs for short documents like this.
 *
 * Order matters a little (front-loaded terms get slightly more weight in
 * practice) so player and set lead, identifiers and flags trail.
 *
 * Notice what's absent: the exact card NUMBER is included as a token
 * ("#249"), but embeddings are bad at treating "#249" as meaningfully
 * different from "#248" — semantically they're almost identical text. That's
 * not a bug to fix here; it's the reason M2 adds full-text search alongside
 * vector search. Keep that in mind when M2's eval set shows vector-only
 * search failing on exact-number queries — this function is why.
 */
export function cardToText(card: NewCard): string {
  const parts: string[] = [];

  parts.push(card.playerName);
  parts.push(`${card.year} ${card.brand ?? ""} ${card.setName}`.trim());
  parts.push(`#${card.cardNumber}`);
  if (card.variation) parts.push(card.variation);
  parts.push(card.sport);

  const attrs = card.attributes ?? {};
  if (attrs.rookie) parts.push("rookie card RC");
  if (attrs.autograph) parts.push("autograph auto signed");
  if (attrs.relic) parts.push("relic patch memorabilia");
  if (attrs.serialNumberedTo) {
    parts.push(`serial numbered /${attrs.serialNumberedTo}`);
  }

  return parts.filter(Boolean).join(" ");
}

/**
 * Content hash for idempotent re-ingestion: if a card's text hasn't changed
 * since the last embed, skip it. This is the difference between re-running
 * ingestion costing pennies vs. re-paying for every row every time.
 */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

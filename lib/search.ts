import { sql } from "drizzle-orm";

import { db } from "@/db";
import { embedQuery, VOYAGE_MODEL } from "./embeddings";

export type VectorSearchResult = {
  cardId: string;
  playerName: string;
  year: number;
  brand: string | null;
  setName: string;
  cardNumber: string;
  variation: string | null;
  sport: string;
  attributes: unknown;
  /**
   * Cosine DISTANCE (pgvector's `<=>`), not similarity — 0 = identical
   * direction, 1 = orthogonal (unrelated), 2 = opposite. Lower is better.
   * Kept as distance rather than converted to similarity here so the SQL
   * ORDER BY and the displayed number are literally the same value — no
   * room for a sign-flip bug between "what we sort by" and "what we show."
   */
  distance: number;
};

/**
 * Pure vector search: embed the query, order the catalog by cosine distance,
 * take the top k. This is the *whole* retrieval story for M1 — no keyword
 * matching, no reranking. Deliberately: M2 exists to show, with a measured
 * eval set, exactly where this breaks (mainly: exact card numbers, where
 * "#248" and "#249" embed as nearly identical text).
 */
export async function vectorSearch(
  query: string,
  limit = 10,
): Promise<VectorSearchResult[]> {
  const queryVector = await embedQuery(query);

  // pgvector's `<=>` takes a vector literal — the same `[0.1,0.2,...]`
  // textual form Drizzle's PgVector column writes on insert (see
  // lib/embeddings.ts / db/schema.ts for why this must be the cosine
  // operator specifically: it's the op class the HNSW index was built with).
  const vectorLiteral = JSON.stringify(queryVector);

  const rows = await db.execute<{
    id: string;
    player_name: string;
    year: number;
    brand: string | null;
    set_name: string;
    card_number: string;
    variation: string | null;
    sport: string;
    attributes: unknown;
    distance: number;
  }>(sql`
    select
      c.id,
      c.player_name,
      c.year,
      c.brand,
      c.set_name,
      c.card_number,
      c.variation,
      c.sport,
      c.attributes,
      (ce.embedding <=> ${vectorLiteral}::vector) as distance
    from card_embeddings ce
    join cards c on c.id = ce.card_id
    where ce.model = ${VOYAGE_MODEL}
    order by ce.embedding <=> ${vectorLiteral}::vector
    limit ${limit}
  `);

  return rows.map((r) => ({
    cardId: r.id,
    playerName: r.player_name,
    year: r.year,
    brand: r.brand,
    setName: r.set_name,
    cardNumber: r.card_number,
    variation: r.variation,
    sport: r.sport,
    attributes: r.attributes,
    distance: r.distance,
  }));
}

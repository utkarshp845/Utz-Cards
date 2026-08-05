/**
 * Ingest catalog cards → embed → store.
 *   npm run ingest
 *
 * Idempotent by design: re-running only re-embeds cards whose text actually
 * changed (compared by content hash), so iterating on cardToText() or adding
 * a new data source doesn't re-spend Voyage tokens on unchanged rows.
 *
 * Data source is currently the synthetic seed catalog (see seed-data.ts for
 * why). Swapping in a real source later means writing a new function that
 * returns NewCard[] and changing the one call below — the rest of this
 * pipeline (upsert, hash-diff, batch embed, index) doesn't change.
 */
import { inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { cards, cardEmbeddings, type NewCard } from "@/db/schema";
import { generateSeedCatalog } from "@/lib/catalog/seed-data";
import { cardToText, contentHash } from "@/lib/catalog/represent";
import { embedDocuments, VOYAGE_MODEL } from "@/lib/embeddings";

// Drizzle doesn't (yet) expose a typed `excluded.<col>` helper for pg
// upserts, so this is the documented raw-SQL escape hatch — safe here
// because the column names are our own literals, never user input.
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

async function upsertCards(rows: NewCard[]) {
  if (rows.length === 0) return [];

  // Chunk to stay well under Postgres's ~65535 bound-parameter limit per
  // statement (rows × ~14 columns) and to keep any single query reasonable.
  const CHUNK = 500;
  const upserted: { id: string }[] = [];

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await db
      .insert(cards)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          cards.year,
          cards.setName,
          cards.cardNumber,
          cards.playerName,
          cards.variation,
        ],
        set: {
          brand: sqlExcluded("brand"),
          attributes: sqlExcluded("attributes"),
          imageUrl: sqlExcluded("image_url"),
          source: sqlExcluded("source"),
          sourceId: sqlExcluded("source_id"),
          updatedAt: new Date(),
        },
      })
      .returning({ id: cards.id });
    upserted.push(...result);
  }

  return upserted;
}

async function main() {
  console.log("Generating seed catalog...");
  const seedRows = generateSeedCatalog();
  console.log(`  ${seedRows.length} cards`);

  console.log("Upserting into cards table...");
  const upserted = await upsertCards(seedRows);
  const cardIds = upserted.map((c) => c.id);
  console.log(`  ${cardIds.length} rows upserted`);

  // Re-select full rows (upserted[] only carries id) so cardToText() has
  // every field it needs, including whatever ON CONFLICT actually landed —
  // not just what we tried to insert.
  const allCards = await db
    .select()
    .from(cards)
    .where(inArray(cards.id, cardIds));

  console.log("Checking which cards need (re-)embedding...");
  const existing = await db
    .select({
      cardId: cardEmbeddings.cardId,
      contentHash: cardEmbeddings.contentHash,
    })
    .from(cardEmbeddings)
    .where(
      inArray(cardEmbeddings.cardId, cardIds),
    );
  const existingHash = new Map(existing.map((e) => [e.cardId, e.contentHash]));

  const toEmbed: { cardId: string; text: string; hash: string }[] = [];
  for (const card of allCards) {
    const text = cardToText(card);
    const hash = contentHash(text);
    if (existingHash.get(card.id) !== hash) {
      toEmbed.push({ cardId: card.id, text, hash });
    }
  }

  console.log(
    `  ${toEmbed.length} of ${allCards.length} need embedding ` +
      `(${allCards.length - toEmbed.length} unchanged, skipped)`,
  );

  if (toEmbed.length > 0) {
    console.log(`Embedding with ${VOYAGE_MODEL}...`);
    const vectors = await embedDocuments(toEmbed.map((t) => t.text));

    console.log("Storing embeddings...");
    const EMBED_CHUNK = 200;
    for (let i = 0; i < toEmbed.length; i += EMBED_CHUNK) {
      const chunk = toEmbed.slice(i, i + EMBED_CHUNK);
      const chunkVectors = vectors.slice(i, i + EMBED_CHUNK);

      await db
        .insert(cardEmbeddings)
        .values(
          chunk.map((t, idx) => ({
            cardId: t.cardId,
            model: VOYAGE_MODEL,
            embedding: chunkVectors[idx],
            content: t.text,
            contentHash: t.hash,
          })),
        )
        .onConflictDoUpdate({
          target: [cardEmbeddings.cardId, cardEmbeddings.model],
          set: {
            embedding: sqlExcluded("embedding"),
            content: sqlExcluded("content"),
            contentHash: sqlExcluded("content_hash"),
          },
        });
    }
  }

  console.log("\n✓ Ingestion complete");
  console.log(`  ${allCards.length} cards, ${toEmbed.length} newly embedded`);
  process.exit(0);
}

main().catch((error) => {
  console.error("\n✗ Ingestion failed\n");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});

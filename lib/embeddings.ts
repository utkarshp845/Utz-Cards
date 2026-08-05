import { z } from "zod";

import { env } from "./env";
import { EMBEDDING_DIMS } from "@/db/schema";

/** Matches the schema constant so a mismatch is a compile error, not a silent bug. */
export const VOYAGE_MODEL = "voyage-4";

/**
 * Voyage embeds text into a fixed-length number[] such that semantically
 * similar text lands at a smaller angle in that space — measured later by
 * cosine distance in Postgres (`<=>`, matching the `vector_cosine_ops` index).
 *
 * The one detail that actually matters for retrieval quality: `input_type`.
 * Voyage trains an asymmetric objective — a *query* ("silver prizm morant
 * rookie") and the *document* it should match ("2019-20 Panini Prizm Ja
 * Morant #249 Silver Prizm Rookie Basketball") are different kinds of text,
 * and the model embeds them differently depending on which role you declare.
 * Tag catalog rows "document" at ingest time and user searches "query" at
 * search time. Get this backwards, or omit it entirely, and nothing errors —
 * results just quietly get worse. There's no way to detect that from the API
 * response alone, which is exactly why it's easy to ship wrong.
 */
export type EmbeddingInputType = "query" | "document";

const voyageResponseSchema = z.object({
  data: z
    .array(
      z.object({
        embedding: z.array(z.number()),
        index: z.number(),
      }),
    )
    .min(1),
  model: z.string(),
  usage: z.object({ total_tokens: z.number() }),
});

/** Voyage accepts up to 1,000 inputs/request; we batch conservatively below that. */
const MAX_BATCH = 128;

async function embed(
  inputs: string[],
  inputType: EmbeddingInputType,
): Promise<number[][]> {
  if (inputs.length === 0) return [];
  if (inputs.length > MAX_BATCH) {
    throw new Error(
      `embed() called with ${inputs.length} inputs; batch by ${MAX_BATCH} first ` +
        `(see embedDocuments)`,
    );
  }

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.voyageApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: inputs,
      model: VOYAGE_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Voyage embeddings request failed: ${res.status} ${res.statusText}\n${body}`,
    );
  }

  const parsed = voyageResponseSchema.parse(await res.json());

  // Defensive, not paranoid: batch APIs occasionally reorder under retry/load
  // balancing. `index` exists precisely so callers don't have to assume order.
  return [...parsed.data]
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/** Embed catalog text at ingest time. Batches internally — pass any number of items. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const chunk = texts.slice(i, i + MAX_BATCH);
    out.push(...(await embed(chunk, "document")));
  }
  return out;
}

/** Embed a single user search string at query time. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "query");
  return vector;
}

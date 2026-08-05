/**
 * M1 smoke test: prove the Voyage key path works end to end, cheaply —
 * one document + one query embedding, before running the full ingest.
 *   npm run check:voyage
 */
import { embedDocuments, embedQuery, VOYAGE_MODEL } from "@/lib/embeddings";
import { EMBEDDING_DIMS } from "@/db/schema";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // Voyage vectors are pre-normalized, so dot product == cosine similarity.
}

async function main() {
  console.log(`Embedding a document with ${VOYAGE_MODEL}...`);
  const [doc] = await embedDocuments([
    "Ja Morant 2019 Panini Prizm #249 Silver rookie card RC basketball",
  ]);
  console.log(`  ${doc.length} dimensions (expect ${EMBEDDING_DIMS})`);
  if (doc.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Dimension mismatch: got ${doc.length}, schema expects ${EMBEDDING_DIMS}. ` +
        `This would silently corrupt the vector column — do not proceed.`,
    );
  }

  console.log("Embedding a matching query (input_type: query)...");
  const query = await embedQuery("morant silver prizm rookie");
  const relatedSim = cosineSimilarity(doc, query);
  console.log(`  similarity to a related query: ${relatedSim.toFixed(4)}`);

  console.log("Embedding an unrelated query, as a contrast check...");
  const unrelated = await embedQuery("golden retriever puppy training tips");
  const unrelatedSim = cosineSimilarity(doc, unrelated);
  console.log(`  similarity to an unrelated query: ${unrelatedSim.toFixed(4)}`);

  console.log(
    relatedSim > unrelatedSim
      ? "\n✓ Voyage OK — related query scored higher than unrelated, as expected"
      : "\n✗ related query did NOT score higher than unrelated — something is wrong",
  );
  process.exit(relatedSim > unrelatedSim ? 0 : 1);
}

main().catch((error) => {
  console.error("\n✗ Voyage check failed\n");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

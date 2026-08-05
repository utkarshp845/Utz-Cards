# Concept 01 — Embeddings and vector search

What M1 actually builds: text → number vector → "closest vectors" as a proxy
for "most relevant cards." Here's what each piece means and why it's built
the way it is, grounded in what actually happened when I built and tested it.

## What an embedding is

`embedQuery()` / `embedDocuments()` in [`lib/embeddings.ts`](../../lib/embeddings.ts)
call Voyage's `voyage-4` model, which turns a string into a fixed-length array
of 1024 floating-point numbers — a point in 1024-dimensional space. The model
is trained so that text with similar *meaning* lands at a small **angle**
from other similar text, regardless of vector length. "Distance" here isn't
Euclidean distance between the points; it's the angle between them, measured
as cosine distance:

```
cosine_distance = 1 − cosine_similarity
```

Range: `0` = pointing the same direction (as similar as it gets), `1` =
orthogonal (unrelated), `2` = pointing opposite directions. When I ran the
verification script and asked it to find the nearest neighbor of a vector
that was already in the table, the answer came back at **distance
`0.0000`** — itself, exactly. That's the sanity check for "is the cosine math
wired up correctly," and it's worth running any time you touch this code.

## The one detail that silently wrecks retrieval quality: `input_type`

Voyage trains catalog documents and search queries as two different
distributions — an `input_type: "document"` embedding and an
`input_type: "query"` embedding for the *same underlying text* land in
slightly different places on purpose, because a query ("silver morant
rookie") and the thing it should match ("2019-20 Panini Prizm Ja Morant #249
Silver Prizm Rookie Basketball") are different *kinds* of text even when
they're about the same card.

`embedDocuments()` in `lib/embeddings.ts` always passes `input_type:
"document"`; `embedQuery()` always passes `input_type: "query"`. Get this
backwards — or just forget to set it — and nothing errors. The API call
succeeds, you get vectors back, they even look reasonable. Retrieval quality
just quietly degrades. There is no way to detect this from the response
alone; you'd only notice from worse search results, which is exactly what
makes it an easy bug to ship.

## The text representation is the real design decision

`cardToText()` in [`lib/catalog/represent.ts`](../../lib/catalog/represent.ts)
turns a card row into dense natural-language text — `"Ja Morant 2019 Panini
Prizm #249 Silver rookie card RC basketball"` — rather than a `key: value`
template. Two things drive that:

1. **Voyage is trained on natural text**, and short label:value documents
   embed worse than natural phrasing for a model trained that way.
2. Whatever goes in this function *is the ceiling* on what search can find.
   If a field isn't in the text, no query can match on it, no matter how
   good the model is.

But notice what's also true: the card number **is** in the text (`#249`),
and embeddings are still bad at treating `#249` as meaningfully different
from `#248`. Semantically, as strings of English, they're nearly identical —
the model has no special notion that a card number is an exact identifier
rather than a descriptive detail. That's not a bug in this function; it's
the reason M2 exists. M2 adds Postgres full-text search *alongside* vector
search specifically because exact identifiers are precisely where pure
embeddings lose to keyword matching, and card numbers are everywhere in this
domain. The eval set in M2 will make that failure mode visible and
measurable instead of theoretical.

## HNSW: what it is, and why it wasn't used in testing (correctly)

The `card_embeddings` table has an HNSW (Hierarchical Navigable Small World)
index — see `db/schema.ts` — built with the `vector_cosine_ops` operator
class. HNSW builds a graph where each vector is connected to its approximate
neighbors, letting a search skip most of the table instead of comparing
against every row. It only pays off once the "every row" alternative is
actually expensive.

When I ran the verification, I used `EXPLAIN` on the exact query
`lib/search.ts` runs, against the full 360-row seed catalog with fake
vectors, and Postgres chose a **sequential scan**, not the HNSW index:

```
Seq Scan on card_embeddings ce  (cost=0.00..15.12 rows=2 width=48)
      Filter: (model = 'tmp-check'::text)
```

That's the query planner working correctly, not a misconfigured index. At
360 rows, scanning every row and computing 360 cosine distances is *cheaper*
than the overhead of traversing an HNSW graph — the index exists and is
correctly built (confirmed separately via `\di+` and `pg_indexes` in M0), it
just isn't the planner's best choice yet. This crossover point is exactly
what M4/M5's real catalog growth will make visible: watch `EXPLAIN` output
change from `Seq Scan` to `Index Scan using card_embeddings_hnsw_idx` as the
table grows, and that's the concept made concrete rather than something to
take on faith.

One thing that **would** be a real bug, and is worth knowing how to spot:
using any operator other than `<=>` (cosine distance) in the query — say,
`<->` (Euclidean) or `<#>` (inner product) — doesn't error, it just silently
stops matching the index's operator class and forces a sequential scan
*regardless of table size*. `lib/search.ts` is commented at the point where
this matters; if search ever gets slow at scale, that's the first thing to
check.

## What's still unverified

Everything above was checked against the real Postgres database with
synthetic vectors, specifically so the DB-side plumbing (upsert idempotency,
the vector column round-trip through Drizzle, the raw SQL in
`lib/search.ts`, and the index/planner behavior) is confirmed correct
independent of Voyage. What's *not* yet verified is whether Voyage's real
embeddings actually cluster sports-card text the way you'd want — that
needs a real `VOYAGE_API_KEY`, a real `npm run ingest`, and a real search on
`/search`. Do that next; if a plain-English query like "haaland gold
parallel" doesn't surface Haaland's gold-parallel cards near the top, that's
the signal to come back and revisit `cardToText()`.

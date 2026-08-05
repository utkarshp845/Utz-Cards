# UtzCards

Sports card intake, identification, pricing, and fulfillment — an operations tool
for a working card business, built as a way to learn RAG, vector search,
multi-source data integration, and agentic tool use.

## Setup

Requires Node 20.9+ and Docker.

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run db:up                # Postgres 17 + pgvector on :5433
npm run db:migrate
npm run check:db             # verifies extensions, tables, cosine operator
npm run check:anthropic      # verifies the Claude key path
npm run ingest                # embeds + indexes the seed catalog (needs VOYAGE_API_KEY)
npm run dev                  # then try /search
```

`ANTHROPIC_API_KEY` ([console](https://platform.claude.com/settings/keys)) and
`VOYAGE_API_KEY` ([dashboard](https://dashboard.voyageai.com/)) are needed from
M1 onward. eBay and EasyPost keys aren't needed until M4 and M6.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Start / stop Postgres |
| `npm run db:reset` | **Destroys the volume** and re-inits from scratch |
| `npm run db:generate` | Generate a migration from `db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Drizzle Studio |
| `npm run check:db` | Database smoke test |
| `npm run check:anthropic` | Claude connectivity smoke test |
| `npm run ingest` | Embed + index the catalog (idempotent — safe to re-run) |

## Layout

```
app/            Next.js App Router pages
db/
  schema.ts     Drizzle schema — start here to understand the data model
  init/         SQL run once at container init (creates pgvector, pg_trgm)
  migrations/   Generated; do not hand-edit
lib/
  anthropic.ts  Claude client, model constant, refusal handling
  embeddings.ts Voyage client — see docs/concepts/01-embeddings.md
  search.ts     Vector search over the catalog
  catalog/      Card→text representation, seed data
  env.ts        Env access with loud failures
scripts/        One-off / operational scripts (run via tsx)
docs/concepts/  Explainers for the AI concepts, written per milestone
```

## Notes for future work

**Sports card data is the hard case.** Unlike Magic or Pokémon there is no free,
clean catalog + price API:

- eBay **Marketplace Insights** (sold comps) is a Limited Release, closed to new
  developers. eBay **Browse** (active listings) is available on a standard
  account at ~5,000 calls/day — but those are *asks*, not *solds*.
- **PSA**'s public API was cut to ~1 call/day for free tokens in mid-2026; pop
  reports were never exposed. A paid plan is required for real use.
- **SportsCardsPro** publishes a prices API + CSVs, but both require a paid
  "Legendary" subscription (confirmed by reading their docs directly) — not
  something to build against speculatively.

Because of this, `lib/catalog/seed-data.ts` is a **synthetic bootstrap
catalog**, not real checklist data: real product names (Panini Prizm, Topps
Chrome UEFA Club Competitions) and real players, but generated card
numbers/parallels/rookie flags, clearly tagged `source: "seed-synthetic"`.
It exists to exercise the ingestion → embedding → search pipeline before real
data is available. Replace it before this app identifies or prices anything
for real.

This is why `price_observations.kind` distinguishes `ask` from `sold`, and why
the UI must always show a price's source and age. Do not average the two into a
single "market value" — the data doesn't support that claim.

We deliberately do not scrape TCDB or PSA. That's a terms-of-service risk for a
business that depends on this tool.

## Status

M0 (foundation) is done. M1 (embeddings + vector search) is built and
DB-side-verified, but end-to-end verification is blocked on a
`VOYAGE_API_KEY` — see [`docs/concepts/01-embeddings.md`](docs/concepts/01-embeddings.md)
for exactly what's confirmed vs. still open. See the roadmap on the home
page.

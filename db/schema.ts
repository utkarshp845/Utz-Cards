import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  unique,
  vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Embedding dimension for Voyage `voyage-4`.
 *
 * voyage-4 is a Matryoshka model: it supports 256 / 512 / 1024 / 2048 and
 * defaults to 1024. Lower dimensions are *truncations* of the same vector, so
 * we could shrink later for index size — but never mix dimensions inside one
 * index. `card_embeddings` is keyed by model name precisely so a re-embed with
 * different settings lands in new rows instead of corrupting the existing index.
 */
export const EMBEDDING_DIMS = 1024;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const inventoryStatus = pgEnum("inventory_status", [
  "intake", // photographed, not yet identified
  "identified", // matched to a catalog card, awaiting pricing
  "available", // in stock, sellable
  "listed", // live on a marketplace
  "sold", // sold, not yet shipped
  "shipped", // label bought and handed off
]);

/**
 * Where a price number came from. Kept explicit rather than collapsed into a
 * single "market value" because these are not interchangeable — see priceKind.
 */
export const priceSource = pgEnum("price_source", [
  "ebay_active", // eBay Browse API — live listings
  "sportscardspro", // SportsCardsPro price data (access pending)
  "manual_comp", // a sold comp your friend entered by hand
]);

/**
 * The honesty field.
 *
 * `ask` is what someone *wants* for a card. `sold` is what someone *paid*.
 * eBay's sold-comp API (Marketplace Insights) is a Limited Release we cannot
 * get, so nearly all automated data here is `ask` — which systematically runs
 * high. Never average asks and solds into one number; show them separately.
 */
export const priceKind = pgEnum("price_kind", ["ask", "sold"]);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * The reference catalog: "this card exists in the world."
 * Distinct from `inventory`, which is "your friend physically owns this copy."
 */
export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    sport: text("sport").notNull(), // basketball, baseball, football...
    year: integer("year").notNull(), // 2019 (season start year)
    brand: text("brand"), // Panini, Topps
    setName: text("set_name").notNull(), // "Prizm", "Chrome Update"

    /** Text, not integer — real card numbers include "RC-12", "1a", "BDC-100". */
    cardNumber: text("card_number").notNull(),

    playerName: text("player_name").notNull(),
    /** Parallel / variation: "Silver", "Red Wave /99", null for base. */
    variation: text("variation"),

    /** Flags that drive value: rookie, auto, relic, serial numbering. */
    attributes: jsonb("attributes")
      .$type<{
        rookie?: boolean;
        autograph?: boolean;
        relic?: boolean;
        serialNumberedTo?: number;
      }>()
      .notNull()
      .default({}),

    imageUrl: text("image_url"),

    /** Provenance, so we can re-sync or distrust a source later. */
    source: text("source").notNull(),
    sourceId: text("source_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Natural key for a printed card. Prevents the same card arriving twice
    // from two ingestion runs.
    //
    // NULLS NOT DISTINCT matters here: Postgres treats NULLs as distinct by
    // default, so without it every base card (variation IS NULL) would happily
    // insert over and over. Note this is a table *constraint* (`unique`), not
    // `uniqueIndex` — only the constraint builder exposes nullsNotDistinct().
    unique("cards_natural_key")
      .on(t.year, t.setName, t.cardNumber, t.playerName, t.variation)
      .nullsNotDistinct(),

    index("cards_player_idx").on(t.playerName),
    index("cards_set_idx").on(t.year, t.setName),

    // Trigram index for fuzzy player-name matching (M2). Handles OCR misreads.
    index("cards_player_trgm_idx").using(
      "gin",
      sql`${t.playerName} gin_trgm_ops`,
    ),

    // Full-text index over the concatenated identity of the card (M2).
    // This is the half of hybrid search that actually nails "2019 Prizm #248" —
    // embeddings are unreliable on exact identifiers like card numbers.
    index("cards_fts_idx").using(
      "gin",
      sql`to_tsvector('english',
        ${t.playerName} || ' ' ||
        ${t.setName} || ' ' ||
        ${t.cardNumber} || ' ' ||
        coalesce(${t.variation}, '') || ' ' ||
        ${t.year}::text
      )`,
    ),
  ],
);

/**
 * Embeddings live in their own table, one row per (card, model).
 *
 * Why not a column on `cards`? Because you will want to swap embedding models
 * and compare recall side by side — that's the M2 eval. A column forces a
 * destructive migration to do that; a table lets both live at once.
 */
export const cardEmbeddings = pgTable(
  "card_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),

    /** e.g. "voyage-4". Part of the unique key so models coexist. */
    model: text("model").notNull(),

    embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }).notNull(),

    /** Exact text that was embedded — makes results reproducible/debuggable. */
    content: text("content").notNull(),
    /** Hash of `content`, so re-ingestion skips unchanged rows and saves tokens. */
    contentHash: text("content_hash").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("card_embeddings_card_model_key").on(t.cardId, t.model),

    // HNSW index for approximate nearest-neighbour search.
    //
    // vector_cosine_ops because we L2-normalize and compare by angle, which is
    // what Voyage embeddings are trained for. The op class MUST match the
    // distance operator used at query time (`<=>`), or Postgres silently
    // ignores the index and does a full scan — a classic slow-RAG bug.
    index("card_embeddings_hnsw_idx")
      .using("hnsw", sql`${t.embedding} vector_cosine_ops`)
      .with({ m: 16, ef_construction: 64 }),
  ],
);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const inventory = pgTable(
  "inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Single-tenant today, but present from day one so that turning this into
     * a real multi-user platform later is a backfill, not a schema rewrite.
     */
    ownerId: text("owner_id").notNull(),

    /** Nullable: a card can be photographed before it's been identified. */
    cardId: uuid("card_id").references(() => cards.id, {
      onDelete: "set null",
    }),

    status: inventoryStatus("status").notNull().default("intake"),

    /** Raw condition for ungraded cards: NM, EX, etc. */
    condition: text("condition"),

    /** Grading, when slabbed. */
    grader: text("grader"), // PSA, BGS, SGC
    grade: text("grade"), // "10", "9.5" — text, because BGS uses half grades
    certNumber: text("cert_number"),

    acquisitionCostCents: integer("acquisition_cost_cents"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }),

    frontImagePath: text("front_image_path"),
    backImagePath: text("back_image_path"),

    /**
     * What the vision model proposed at intake, kept even after a human
     * confirms. This is the training signal for measuring identification
     * accuracy over time — how often was the top candidate right?
     */
    intakeExtraction: jsonb("intake_extraction"),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inventory_owner_status_idx").on(t.ownerId, t.status),
    index("inventory_card_idx").on(t.cardId),
    uniqueIndex("inventory_cert_key").on(t.grader, t.certNumber),
  ],
);

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

/**
 * Append-only log of observed prices. We never overwrite — a price is a fact
 * observed at a time, and the history is what makes trends visible.
 */
export const priceObservations = pgTable(
  "price_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),

    source: priceSource("source").notNull(),
    kind: priceKind("kind").notNull(),

    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),

    /** Condition/grade this price applies to — a PSA 10 is a different market. */
    grader: text("grader"),
    grade: text("grade"),
    condition: text("condition"),

    url: text("url"),
    /** Untouched provider payload, for debugging a bad parse after the fact. */
    raw: jsonb("raw"),

    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("price_obs_card_observed_idx").on(t.cardId, t.observedAt.desc()),
    index("price_obs_kind_idx").on(t.cardId, t.kind, t.observedAt.desc()),
  ],
);

// ---------------------------------------------------------------------------
// Sales & fulfillment
// ---------------------------------------------------------------------------

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inventoryId: uuid("inventory_id")
      .notNull()
      .references(() => inventory.id, { onDelete: "restrict" }),

    salePriceCents: integer("sale_price_cents").notNull(),
    /** Marketplace + payment fees, so margin is real rather than gross. */
    feesCents: integer("fees_cents").notNull().default(0),
    shippingChargedCents: integer("shipping_charged_cents").notNull().default(0),

    channel: text("channel").notNull(), // ebay, in_person, whatnot...
    buyerRef: text("buyer_ref"),

    soldAt: timestamp("sold_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sales_sold_at_idx").on(t.soldAt.desc())],
);

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),

    carrier: text("carrier"),
    service: text("service"),
    trackingNumber: text("tracking_number"),
    labelCostCents: integer("label_cost_cents"),

    easypostShipmentId: text("easypost_shipment_id"),
    labelUrl: text("label_url"),

    status: text("status").notNull().default("pending"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("shipments_tracking_idx").on(t.trackingNumber)],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type CardEmbedding = typeof cardEmbeddings.$inferSelect;
export type InventoryItem = typeof inventory.$inferSelect;
export type PriceObservation = typeof priceObservations.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;

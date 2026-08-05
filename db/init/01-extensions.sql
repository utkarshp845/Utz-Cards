-- Runs automatically on first container init (empty data volume).
-- Drizzle migrations do not create extensions, so this is the one place
-- they're guaranteed to exist before any migration runs.

-- pgvector: the `vector` column type + HNSW/IVFFlat index access methods.
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: trigram similarity. Used in M2 for fuzzy matching on player names,
-- where a vision OCR misread ("Ja Morannt") still needs to reach the right row.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

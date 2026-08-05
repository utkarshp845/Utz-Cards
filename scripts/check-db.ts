/**
 * M0 smoke test: Postgres reachable, extensions present, tables migrated.
 *   npm run check:db
 *
 * Env comes from `node --env-file=.env.local` (set in package.json), not from
 * a dotenv call in this file: ES imports are hoisted, so `config()` here would
 * run *after* @/db was evaluated and had already read process.env.
 */
import { sql } from "drizzle-orm";

import { db } from "@/db";

async function main() {
  const version = await db.execute<{ version: string }>(
    sql`select version() as version`,
  );
  console.log("postgres:", version[0]?.version?.split(",")[0]);

  const extensions = await db.execute<{ extname: string; extversion: string }>(
    sql`select extname, extversion from pg_extension
        where extname in ('vector', 'pg_trgm') order by extname`,
  );
  if (extensions.length < 2) {
    throw new Error(
      `Expected 'vector' and 'pg_trgm' extensions, found: ` +
        `${extensions.map((e) => e.extname).join(", ") || "none"}. ` +
        `The init script only runs on a fresh volume — try: ` +
        `docker compose down -v && docker compose up -d`,
    );
  }
  for (const e of extensions) console.log(`extension ${e.extname}:`, e.extversion);

  const tables = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
  );
  console.log(
    "tables:",
    tables.length ? tables.map((t) => t.table_name).join(", ") : "(none — run npm run db:migrate)",
  );

  // Prove the vector type and the cosine operator actually work.
  const probe = await db.execute<{ distance: number }>(
    sql`select ('[1,0,0]'::vector <=> '[0,1,0]'::vector) as distance`,
  );
  console.log("cosine distance probe (expect 1):", probe[0]?.distance);

  console.log("\n✓ database OK");
  process.exit(0);
}

main().catch((error) => {
  console.error("\n✗ Database check failed\n");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

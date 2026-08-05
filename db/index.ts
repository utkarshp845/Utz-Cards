// Server-side only — see the note in lib/env.ts on why `server-only`
// is intentionally not imported here.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { env } from "@/lib/env";

/**
 * Next dev with HMR re-evaluates modules on edit. Without caching the client on
 * globalThis, every save opens a new pool and you exhaust Postgres connections
 * within a few minutes of editing.
 */
const globalForDb = globalThis as unknown as {
  __utzcardsSql?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__utzcardsSql ??
  postgres(env.databaseUrl, {
    max: 10,
    // Drizzle handles its own type parsing; keep postgres.js from
    // reinterpreting the `vector` type as something unexpected.
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__utzcardsSql = client;
}

export const db = drizzle(client, { schema });
export { schema };

import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Note: `vector` and `pg_trgm` extensions are created by
  // db/init/01-extensions.sql when the container first initialises.
  // drizzle-kit does not create extensions itself.
  verbose: true,
  strict: true,
});

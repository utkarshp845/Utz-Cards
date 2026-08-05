/**
 * Server-side only. Deliberately NOT importing `server-only`: that package
 * throws under the `default` export condition, which is what plain Node/tsx
 * resolves to — so it would break `scripts/*` that legitimately need env + db.
 * Keep this out of client components by convention instead.
 *
 * Fail loudly at the point of use rather than silently sending `undefined`
 * into an API client and debugging a confusing 401 later.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get voyageApiKey() {
    return required("VOYAGE_API_KEY");
  },

  // Not needed until M4/M6 — optional so M0–M3 run without them.
  get ebayClientId() {
    return optional("EBAY_CLIENT_ID");
  },
  get ebayClientSecret() {
    return optional("EBAY_CLIENT_SECRET");
  },
  get easypostApiKey() {
    return optional("EASYPOST_API_KEY");
  },
};

/** Single-tenant for now; see the ownerId note in db/schema.ts. */
export const DEFAULT_OWNER_ID = "utz";

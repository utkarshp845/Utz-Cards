import Link from "next/link";

import { vectorSearch, type VectorSearchResult } from "@/lib/search";

export const dynamic = "force-dynamic";

function AttrBadges({ attributes }: { attributes: unknown }) {
  const a = (attributes ?? {}) as {
    rookie?: boolean;
    autograph?: boolean;
    relic?: boolean;
    serialNumberedTo?: number;
  };
  const badges = [
    a.rookie && "RC",
    a.autograph && "AUTO",
    a.relic && "RELIC",
    a.serialNumberedTo && `/${a.serialNumberedTo}`,
  ].filter(Boolean);

  if (badges.length === 0) return null;
  return (
    <span className="ml-2 inline-flex gap-1">
      {badges.map((b) => (
        <span
          key={String(b)}
          className="rounded border border-black/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/60 dark:border-white/20 dark:text-white/60"
        >
          {b}
        </span>
      ))}
    </span>
  );
}

function ResultRow({ result }: { result: VectorSearchResult }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm">
          <span className="font-medium">{result.playerName}</span>
          <AttrBadges attributes={result.attributes} />
        </p>
        <p className="mt-0.5 text-xs text-black/55 dark:text-white/55">
          {result.year} {result.brand} {result.setName} #{result.cardNumber}
          {result.variation ? ` · ${result.variation}` : ""} ·{" "}
          <span className="capitalize">{result.sport}</span>
        </p>
      </div>
      <span
        className="shrink-0 font-mono text-xs tabular-nums text-black/40 dark:text-white/40"
        title="Cosine distance — lower means closer"
      >
        {result.distance.toFixed(4)}
      </span>
    </li>
  );
}

export default async function SearchPage(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q : "";

  let results: VectorSearchResult[] = [];
  let error: string | null = null;

  if (query.trim()) {
    try {
      results = await vectorSearch(query, 15);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <Link
        href="/"
        className="text-xs text-black/50 hover:underline dark:text-white/50"
      >
        ← UtzCards
      </Link>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Vector search
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Pure semantic search over the catalog — no keyword matching yet. Try a
        plain-English description, and separately try an exact card number,
        to feel where this approach is strong and where it isn&apos;t.
      </p>

      <form method="GET" className="mt-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="e.g. haaland gold parallel, or 2023 prizm #187"
          className="flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
          autoFocus
        />
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Search failed
          </p>
          <p className="mt-1 break-all font-mono text-xs text-red-600/80 dark:text-red-400/80">
            {error}
          </p>
          {error.includes("VOYAGE_API_KEY") && (
            <p className="mt-2 text-xs text-black/60 dark:text-white/60">
              Add <code className="font-mono">VOYAGE_API_KEY</code> to{" "}
              <code className="font-mono">.env.local</code> — get one free at{" "}
              <a
                href="https://dashboard.voyageai.com/"
                className="underline"
              >
                dashboard.voyageai.com
              </a>
              .
            </p>
          )}
        </div>
      )}

      {!error && query.trim() && results.length === 0 && (
        <p className="mt-8 text-sm text-black/55 dark:text-white/55">
          No results. Has the catalog been ingested? Run{" "}
          <code className="font-mono">npm run ingest</code>.
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-8 divide-y divide-black/10 dark:divide-white/10">
          {results.map((r) => (
            <ResultRow key={r.cardId} result={r} />
          ))}
        </ul>
      )}
    </main>
  );
}

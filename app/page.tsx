import Link from "next/link";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { cards, cardEmbeddings, inventory } from "@/db/schema";

// Always hit the database — this is a live status view, not a static page.
export const dynamic = "force-dynamic";

type Health =
  | { ok: true; cards: number; embeddings: number; inventory: number }
  | { ok: false; error: string };

async function getHealth(): Promise<Health> {
  try {
    const [row] = await db
      .select({
        cards: sql<number>`(select count(*) from ${cards})::int`,
        embeddings: sql<number>`(select count(*) from ${cardEmbeddings})::int`,
        inventory: sql<number>`(select count(*) from ${inventory})::int`,
      })
      .from(sql`(select 1) as _`);

    return { ok: true, ...row };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const MILESTONES = [
  { id: "M0", name: "Foundation", done: true },
  { id: "M1", name: "Embeddings + vector search", done: false },
  { id: "M2", name: "Hybrid retrieval + evals", done: false },
  { id: "M3", name: "Vision intake", done: false },
  { id: "M4", name: "Multi-source pricing", done: false },
  { id: "M5", name: "Agentic assistant", done: false },
  { id: "M6", name: "Shipping", done: false },
];

export default async function Home() {
  const health = await getHealth();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">UtzCards</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Sports card intake, identification, pricing, and fulfillment.
          </p>
        </div>
        <Link
          href="/search"
          className="shrink-0 text-sm underline underline-offset-4 hover:text-black dark:hover:text-white"
        >
          Search →
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
          Database
        </h2>
        {health.ok ? (
          <dl className="mt-3 grid grid-cols-3 gap-3">
            {[
              { label: "Catalog cards", value: health.cards },
              { label: "Embeddings", value: health.embeddings },
              { label: "Inventory", value: health.inventory },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-black/10 p-4 dark:border-white/15"
              >
                <dt className="text-xs text-black/55 dark:text-white/55">
                  {stat.label}
                </dt>
                <dd className="mt-1 font-mono text-xl tabular-nums">
                  {stat.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              Cannot reach the database
            </p>
            <p className="mt-1 break-all font-mono text-xs text-red-600/80 dark:text-red-400/80">
              {health.error}
            </p>
            <p className="mt-2 text-xs text-black/60 dark:text-white/60">
              Try <code className="font-mono">npm run db:up</code>, then{" "}
              <code className="font-mono">npm run db:migrate</code>.
            </p>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
          Roadmap
        </h2>
        <ul className="mt-3 divide-y divide-black/10 dark:divide-white/10">
          {MILESTONES.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span
                aria-hidden
                className={
                  m.done
                    ? "size-1.5 rounded-full bg-emerald-500"
                    : "size-1.5 rounded-full bg-black/20 dark:bg-white/20"
                }
              />
              <span className="font-mono text-xs text-black/45 dark:text-white/45">
                {m.id}
              </span>
              <span className={m.done ? "" : "text-black/55 dark:text-white/55"}>
                {m.name}
              </span>
              {m.done && (
                <span className="ml-auto text-xs text-emerald-600 dark:text-emerald-400">
                  done
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

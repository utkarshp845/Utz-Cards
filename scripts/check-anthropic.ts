/**
 * M0 smoke test: prove the Claude key path works end to end.
 *   npm run check:anthropic
 *
 * Env comes from `node --env-file=.env.local` (see package.json) — see the
 * note in check-db.ts on why a dotenv call in this file would be too late.
 */
import { MODEL, anthropic, textFrom, usageSummary } from "@/lib/anthropic";

async function main() {
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content:
          "Reply with exactly: UtzCards is wired up. Then, on a new line, " +
          "name the 1986 Fleer basketball rookie card most associated with " +
          "Michael Jordan, including its card number.",
      },
    ],
  });

  console.log(textFrom(message));
  console.log("\n---");
  console.log("model:", message.model);
  console.log("stop_reason:", message.stop_reason);
  console.log("usage:", usageSummary(message));
}

main().catch((error) => {
  console.error("\n✗ Claude check failed\n");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

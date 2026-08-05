import Anthropic from "@anthropic-ai/sdk";

import { env } from "./env";

/**
 * Claude Opus 5. Used for three jobs in this app:
 *   - M3 vision intake (reading a card front/back into structured fields)
 *   - M2 reranking (choosing among retrieved catalog candidates)
 *   - M5 the assistant (tool-use loop over inventory + pricing)
 *
 * Thinking is ON by default on Opus 5 — you do not pass a `thinking` param to
 * get it. Consequence worth remembering: `max_tokens` caps thinking + visible
 * output *together*, so a tight max_tokens can truncate a real answer.
 */
export const MODEL = "claude-opus-5";

let cached: Anthropic | undefined;

export function anthropic(): Anthropic {
  cached ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return cached;
}

/**
 * Thrown when Claude's safety classifiers decline a request.
 *
 * This is NOT an HTTP error — a refusal comes back as a perfectly successful
 * 200 with `stop_reason: "refusal"` and an empty/partial `content`. Code that
 * reaches straight for `content[0].text` crashes with a confusing undefined
 * error instead of saying what happened. Hence the explicit check below.
 */
export class ClaudeRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Claude declined this request (category: ${category ?? "unknown"})`);
    this.name = "ClaudeRefusalError";
  }
}

/** Concatenate the text blocks of a response, after checking for a refusal. */
export function textFrom(message: Anthropic.Message): string {
  if (message.stop_reason === "refusal") {
    throw new ClaudeRefusalError(message.stop_details?.category ?? null);
  }
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** Token usage, for the cost tracking we'll lean on once the agent loop lands. */
export function usageSummary(message: Anthropic.Message) {
  const u = message.usage;
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

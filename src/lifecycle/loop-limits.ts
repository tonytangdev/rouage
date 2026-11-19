import { Config, Effect } from "effect";

import type { LoopLimits } from "./work-item.ts";

const DEFAULT_LIMIT = 3;

const limit = (variable: string, override: number | undefined) =>
  override === undefined
    ? Config.Int(variable).pipe(Config.withDefault(DEFAULT_LIMIT))
    : Config.succeed(override);

/**
 * Resolves the loop limits for a new work item. An explicit option wins over
 * `ROUAGE_MAX_REVIEW_LOOPS` / `ROUAGE_MAX_REPRODUCE_LOOPS`, which win over 3.
 * Resolve once per work item and store the result, so a restart or a changed
 * variable never moves the limits of a work item already in flight.
 */
export const resolveLoopLimits = Effect.fnUntraced(function* (overrides: Partial<LoopLimits> = {}) {
  return yield* Config.all({
    review: limit("ROUAGE_MAX_REVIEW_LOOPS", overrides.review),
    reproduce: limit("ROUAGE_MAX_REPRODUCE_LOOPS", overrides.reproduce),
  });
});

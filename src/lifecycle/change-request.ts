import { Match, Schema } from "effect";

import type { FactEvent } from "./fact-event.ts";
import { taughtBy } from "./outcome-teaching.ts";

/**
 * What the change was last sent back to Build to address, and where that came
 * from: the changes Review requested, or a human's rejection at the ship gate,
 * whose `text` is `null` when it came without a comment (ADR 0012).
 */
export const ChangeRequestSchema = Schema.Union([
  Schema.Struct({ from: Schema.Literal("review"), text: Schema.String }),
  Schema.Struct({ from: Schema.Literal("shipGate"), text: Schema.NullOr(Schema.String) }),
]);
export type ChangeRequest = typeof ChangeRequestSchema.Type;

/**
 * The change request after `event`: replaced only when the change is sent
 * back to Build, and dropped on return to Spec, because a new spec makes
 * earlier requests obsolete (ADR 0012).
 */
export const changeRequestAfter = (
  request: ChangeRequest | null,
  event: FactEvent,
): ChangeRequest | null =>
  Match.valueTags(event, {
    stageFinished: ({ outcome }) => taughtBy(outcome).changeRequest ?? request,
    // The change is not sent back to Build, and a retry re-runs Review on the
    // change Build last made, so the request Build last addressed stands.
    loopExhausted: () => request,
    gateRejected: ({ gate, comment }): ChangeRequest | null =>
      gate === "shipGate" ? { from: "shipGate", text: comment } : request,
    returnedToSpec: () => null,
    retried: () => request,
    demoOverridden: () => request,
  });

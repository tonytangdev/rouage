import { Match, Schema } from "effect";

import type { StandingFact } from "./facts.ts";
import type { Teaching } from "./outcome-teaching.ts";
import type { Transition } from "./transition.ts";
import { returnsToSpec } from "./transition.ts";

/**
 * What the change was last sent back to Build to address, and where that came
 * from: the changes Review requested, a human's rejection at the ship gate,
 * whose `text` is `null` when it came without a comment (ADR 0012), or what
 * kept Ship from landing the change (ADR 0013).
 */
export const ChangeRequestSchema = Schema.Union([
  Schema.Struct({ from: Schema.Literal("review"), text: Schema.String }),
  Schema.Struct({ from: Schema.Literal("shipGate"), text: Schema.NullOr(Schema.String) }),
  Schema.Struct({ from: Schema.Literal("ship"), text: Schema.String }),
]);
export type ChangeRequest = typeof ChangeRequestSchema.Type;

// Replaced only when the change is sent back to Build, and dropped on return
// to Spec, because a new spec makes earlier requests obsolete (ADR 0012).
const changeRequestAfter = (
  request: ChangeRequest | null,
  transition: Transition,
  taught: Teaching,
): ChangeRequest | null => {
  if (returnsToSpec(transition)) {
    return null;
  }
  return Match.value(transition).pipe(
    Match.tags({
      // An outcome that does not send the change back to Build teaches no
      // request, so the one Build last addressed stands for Review to check.
      stageFinished: () => taught.changeRequest ?? request,
      gateRejected: ({ gate, decision }): ChangeRequest | null =>
        gate === "shipGate" ? { from: "shipGate", text: decision.comment ?? null } : request,
    }),
    Match.orElse(() => request),
  );
};

const ChangeRequestFactSchema = Schema.Struct({
  /** What the change was last sent back to Build to address; kept after Build finishes so Review can check it, and reset only on return to Spec (ADR 0012). */
  changeRequest: Schema.NullOr(ChangeRequestSchema),
});

/** The latest change request, standing until a newer one or a return to Spec (ADR 0012). */
export const changeRequestFact: StandingFact<typeof ChangeRequestFactSchema> = {
  schema: ChangeRequestFactSchema,
  empty: { changeRequest: null },
  after: ({ changeRequest }, transition, taught) => ({
    changeRequest: changeRequestAfter(changeRequest, transition, taught),
  }),
};

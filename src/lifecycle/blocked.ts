import type { FailureReason, StageName } from "./stage.ts";
import { failureReasonOf } from "./stage.ts";

export interface Blocked {
  readonly from: StageName;
  readonly reason: FailureReason;
}

// These return context patches only: each transition keeps its target literal
// inline, because visual tools cannot draw a target returned by a helper.

export const blockedOn = (from: StageName, reason: FailureReason) => ({
  blocked: { from, reason },
});

/** Blocks on the stage that errored, with the reason `failureReasonOf` gives. */
export const stageErrored = (from: StageName, error: unknown) =>
  blockedOn(from, failureReasonOf(error));

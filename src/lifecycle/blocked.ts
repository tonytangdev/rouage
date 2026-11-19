import { Predicate } from "effect";

import type { FailureReason } from "./outcomes.ts";
import { StageFailure } from "./outcomes.ts";

export type StageName =
  | "intake"
  | "spec"
  | "provision"
  | "reproduce"
  | "plan"
  | "build"
  | "demo"
  | "review"
  | "ship";

export interface Blocked {
  readonly from: StageName;
  readonly reason: FailureReason;
}

// These return context patches only: each transition keeps its target literal
// inline, because visual tools cannot draw a target returned by a helper.

export const blockedOn = (from: StageName, reason: FailureReason) => ({
  blocked: { from, reason },
});

/** Blocks on the stage that errored: its `StageFailure` reason, or a crash for any other error. */
export const stageErrored = (from: StageName, error: unknown) => {
  if (error instanceof StageFailure) {
    return blockedOn(from, error.reason);
  }
  return blockedOn(from, {
    tag: "StageCrashed",
    message: Predicate.isError(error) ? error.message : String(error),
  });
};

export const loopLimitReached = (from: StageName, message: string) =>
  blockedOn(from, { tag: "LoopLimitReached", message });

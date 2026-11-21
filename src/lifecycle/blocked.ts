import { Schema } from "effect";

import type { FailureReason, OutcomeOf, StageName } from "./stage.ts";
import { FailureReasonSchema, StageNameSchema, failureReasonOf } from "./stage.ts";

/** Why a work item is blocked, and the stage a retry re-enters. */
export const BlockedSchema = Schema.Struct({ from: StageNameSchema, reason: FailureReasonSchema });
export type Blocked = typeof BlockedSchema.Type;

type CheckPassed = Extract<OutcomeOf<"reproduce">, { readonly _tag: "checkPassed" }>;

/** Why a reproduction whose check passed blocks the work item (ADR 0009). */
export const reproductionDidNotFail = ({
  reproductionRef,
  output,
}: CheckPassed): FailureReason => ({
  tag: "ReproductionDidNotFail",
  message: `The reproduction ${reproductionRef} passed, so it does not show the bug: ${output}`,
});

// These return context patches only: each transition keeps its target literal
// inline, because visual tools cannot draw a target returned by a helper.

export const blockedOn = (from: StageName, reason: FailureReason) => ({
  blocked: { from, reason },
});

/** Blocks on the stage that errored, with the reason `failureReasonOf` gives. */
export const stageErrored = (from: StageName, error: unknown) =>
  blockedOn(from, failureReasonOf(error));

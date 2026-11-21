import { Match, Schema } from "effect";

import { stageFinished } from "./facts.ts";
import type { FailureReason, OutcomeOf, StageName } from "./stage.ts";
import { FailureReasonSchema, StageNameSchema, failureReasonOf } from "./stage.ts";
import type { WorkItemContext } from "./work-item.ts";

/** Why a work item is blocked, and the stage a retry re-enters. */
export const BlockedSchema = Schema.Struct({ from: StageNameSchema, reason: FailureReasonSchema });
export type Blocked = typeof BlockedSchema.Type;

/** The Reproduce outcomes that finish the stage but block the work item. */
type BlockingReproduceOutcome = Extract<
  OutcomeOf<"reproduce">,
  { readonly _tag: "cannotReproduce" | "checkPassed" }
>;

// Matched by tag, so a tag added to `BlockingReproduceOutcome` fails to
// compile here until it says why it blocks.
const reasonFor = (outcome: BlockingReproduceOutcome): FailureReason =>
  Match.valueTags(outcome, {
    cannotReproduce: ({ reason }) => ({ tag: "CannotReproduce", message: reason }),
    checkPassed: ({ reproductionRef, output }) => ({
      tag: "ReproductionDidNotFail",
      message: `The reproduction ${reproductionRef} passed, so it does not show the bug: ${output}`,
    }),
  });

// These return context patches only: each transition keeps its target literal
// inline, because visual tools cannot draw a target returned by a helper.

export const blockedOn = (from: StageName, reason: FailureReason) => ({
  blocked: { from, reason },
});

/**
 * The context change when Reproduce finishes with an outcome that blocks the
 * work item: the facts the outcome teaches, such as the reproduction whose
 * check passed for a retry to revise (ADR 0009), and the reason it blocks.
 */
export const reproduceBlocked = (context: WorkItemContext, outcome: BlockingReproduceOutcome) => ({
  ...stageFinished(context, "reproduce", outcome),
  ...blockedOn("reproduce", reasonFor(outcome)),
});

/** Blocks on the stage that errored, with the reason `failureReasonOf` gives. */
export const stageErrored = (from: StageName, error: unknown) =>
  blockedOn(from, failureReasonOf(error));

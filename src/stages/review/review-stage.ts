import { builtChangeTask } from "../built-change.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { ReviewTask, Verdict } from "./reviewer.ts";
import { Reviewer } from "./reviewer.ts";

/**
 * The Review stage machine: asks the `Reviewer` in context to judge the built
 * change against its spec, plan and evidence, and the change request it was
 * last sent back with, and finishes with its verdict.
 * Fails when there is no sandbox, or with the reviewer's reason when it gives
 * up; either blocks the work item.
 */
export const reviewStage = singleStepStage(Reviewer, {
  stage: "review",
  task: (input) =>
    builtChangeTask("Review", input, {
      demoRef: input.demoRef,
      changeRequest: input.changeRequest,
    }),
  ask: (reviewer, task: ReviewTask) => reviewer.review(task),
  outcome: (verdict: Verdict) => verdict,
});

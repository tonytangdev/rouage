import { builtChangeTask } from "../built-change.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { ReviewTask, Verdict } from "./reviewer.ts";
import { Reviewer } from "./reviewer.ts";

/**
 * The Review stage machine: asks the `Reviewer` in context to judge the built
 * change against its spec, plan and evidence, and finishes with its verdict.
 * Fails when there is no sandbox, or with the reviewer's reason when it gives
 * up; either blocks the work item.
 */
export const reviewStage = singleStepStage(Reviewer, {
  stage: "review",
  task: (input) =>
    builtChangeTask("Review", input, {
      demoRef: input.demoPlanned === true ? input.demoRef : null,
    }),
  ask: (reviewer, task: ReviewTask) => reviewer.review(task),
  outcome: (verdict: Verdict) => verdict,
});

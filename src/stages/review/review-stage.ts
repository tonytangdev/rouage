import type { StageFailure, StageInput } from "../../lifecycle/stage.ts";
import { sandboxMissing } from "../sandbox-missing.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { ReviewTask, Verdict } from "./reviewer.ts";
import { Reviewer } from "./reviewer.ts";

const reviewTask = (input: StageInput): ReviewTask | StageFailure =>
  input.sandboxRef === null
    ? sandboxMissing("Review")
    : {
        workItemId: input.workItemId,
        issueRef: input.issueRef,
        kind: input.kind,
        specRef: input.specRef,
        planRef: input.planRef,
        sandboxRef: input.sandboxRef,
        reproductionRef: input.reproductionRef,
        demoRef: input.demoPlanned === true ? input.demoRef : null,
      };

/**
 * The Review stage machine: asks the `Reviewer` in context to judge the built
 * change against its spec, plan and evidence, and finishes with its verdict.
 * Fails when there is no sandbox, or with the reviewer's reason when it gives
 * up; either blocks the work item.
 */
export const reviewStage = singleStepStage(Reviewer, {
  stage: "review",
  task: reviewTask,
  ask: (reviewer, task: ReviewTask) => reviewer.review(task),
  outcome: (verdict: Verdict) => verdict,
});

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { WriteTask, Written } from "./spec-writer.ts";
import { SpecWriter } from "./spec-writer.ts";

const unclassified = () =>
  new StageFailure({
    reason: {
      tag: "Unclassified",
      message: "Spec needs a work item classified as a bug or a feature",
    },
  });

// The lifecycle sends an unclassified work item to Intake, so a null kind means a lifecycle that skips Intake.
const writeTask = (input: StageInput): WriteTask | StageFailure =>
  input.kind === null
    ? unclassified()
    : {
        workItemId: input.workItemId,
        issueRef: input.issueRef,
        kind: input.kind,
        feedback: input.feedback,
        previousSpecRef: input.specRef,
      };

const written = (answer: Written): OutcomeOf<"spec"> | StageFailure =>
  answer._tag === "unclear"
    ? new StageFailure({ reason: { tag: "Unspecifiable", message: answer.reason } })
    : { _tag: "written", specRef: answer.specRef };

/**
 * The Spec stage machine, writing the work item's expected behaviour with the
 * `SpecWriter` in context and finishing with the reference it returns. Fails
 * with a `StageFailure` when the work item has no kind, the writer finds the
 * issue unclear, or the writer cannot finish.
 */
export const specStage = singleStepStage(SpecWriter, {
  stage: "spec",
  task: writeTask,
  ask: (specWriter, task: WriteTask) => specWriter.write(task),
  outcome: written,
});

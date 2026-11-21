import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import { briefOf } from "../run-brief.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { WriteTask, Written } from "./spec-writer.ts";
import { SpecWriter, WriteTaskSchema } from "./spec-writer.ts";

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
        ...briefOf(input),
        issueRef: input.issueRef,
        kind: input.kind,
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
  taskSchema: WriteTaskSchema,
  ask: (specWriter, task: WriteTask) => specWriter.write(task),
  outcome: written,
});

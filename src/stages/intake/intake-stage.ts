import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import { singleStepStage } from "../single-step-stage.ts";
import type { Classification, ClassifyTask } from "./classifier.ts";
import { Classifier } from "./classifier.ts";

const classifyTask = (input: StageInput): ClassifyTask => ({
  workItemId: input.workItemId,
  issueRef: input.issueRef,
  feedback: input.feedback,
});

const classified = (classification: Classification): OutcomeOf<"intake"> | StageFailure =>
  classification._tag === "unclear"
    ? new StageFailure({ reason: { tag: "Unclassifiable", message: classification.reason } })
    : { _tag: "classified", kind: classification.kind };

/**
 * The Intake stage machine, classifying the work item's issue with the
 * `Classifier` in context. Fails with a `StageFailure` when the classifier
 * cannot finish or cannot tell a bug from a feature.
 */
export const intakeStage = singleStepStage(Classifier, {
  stage: "intake",
  task: classifyTask,
  ask: (classifier, task: ClassifyTask) => classifier.classify(task),
  outcome: classified,
});

import { setup, types } from "xstate";

import type { Kind, OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import type { ClassifyTask } from "./classifier.ts";
import { Classifier } from "./classifier.ts";

const classifyTask = ({ context }: { readonly context: StageInput }): ClassifyTask => ({
  workItemId: context.workItemId,
  issueRef: context.issueRef,
  feedback: context.feedback,
});

const unclassifiable = (reason: string) =>
  new StageFailure({ reason: { tag: "Unclassifiable", message: reason } });

const intakeSetup = (step: PortStep<Classifier["Service"]>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<StageInput>(),
      output: types<OutcomeOf<"intake">>(),
    },
    actors: {
      classify: step((classifier, task: ClassifyTask) => classifier.classify(task)),
    },
    states: {
      classifying: {},
      classified: { type: "final", schemas: { input: types<{ readonly kind: Kind }>() } },
    },
  });

const intakeMachine = (step: PortStep<Classifier["Service"]>) =>
  intakeSetup(step).createMachine({
    id: "intake",
    context: ({ input }) => input,
    initial: "classifying",
    states: {
      classifying: {
        invoke: {
          id: "classify",
          src: "classify",
          input: classifyTask,
          onDone: ({ event: { output } }) => {
            if (output._tag === "unclear") {
              throw unclassifiable(output.reason);
            }
            return { target: "classified", input: { kind: output.kind } };
          },
        },
      },
      classified: {
        type: "final",
        output: ({ input }) => ({ _tag: "classified", kind: input.kind }),
      },
    },
  });

/**
 * The Intake stage machine, classifying the work item's issue with the
 * `Classifier` in context. Fails with a `StageFailure` when the classifier
 * cannot finish or cannot tell a bug from a feature.
 */
export const intakeStage = portStage(Classifier, intakeMachine);

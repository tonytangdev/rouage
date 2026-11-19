import type { Context } from "effect";
import { Effect } from "effect";
import { setup, types } from "xstate";

import type { ClassifyTask } from "../plugins/classifier.ts";
import { Classifier } from "../plugins/classifier.ts";
import { portStep } from "./port-step.ts";
import type { Kind, OutcomeOf, StageInput } from "./stage.ts";
import { StageFailure } from "./stage.ts";

const classifyTask = ({ context }: { readonly context: StageInput }): ClassifyTask => ({
  workItemId: context.workItemId,
  issueRef: context.issueRef,
  feedback: context.feedback,
});

const unclassifiable = (reason: string) =>
  new StageFailure({ reason: { tag: "Unclassifiable", message: reason } });

const intakeSetup = (services: Context.Context<Classifier>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<StageInput>(),
      output: types<OutcomeOf<"intake">>(),
    },
    actors: {
      classify: portStep(services, (task: ClassifyTask) =>
        Classifier.use((classifier) => classifier.classify(task)),
      ),
    },
    states: {
      classifying: {},
      classified: { type: "final", schemas: { input: types<{ readonly kind: Kind }>() } },
    },
  });

const intakeMachine = (services: Context.Context<Classifier>) =>
  intakeSetup(services).createMachine({
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
export const intakeStage = Effect.fnUntraced(function* () {
  return intakeMachine(yield* Effect.context<Classifier>());
});

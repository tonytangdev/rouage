import { setup, types } from "xstate";

import type { Kind, OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import type { WriteTask } from "./spec-writer.ts";
import { SpecWriter } from "./spec-writer.ts";

interface Classified {
  readonly kind: Kind;
}

const writeTask = ({
  context,
  input,
}: {
  readonly context: StageInput;
  readonly input: Classified;
}): WriteTask => ({
  workItemId: context.workItemId,
  issueRef: context.issueRef,
  kind: input.kind,
  feedback: context.feedback,
  previous: context.spec,
});

const unclassified = () =>
  new StageFailure({
    reason: {
      tag: "Unclassified",
      message: "Spec needs a work item classified as a bug or a feature",
    },
  });

const unspecifiable = (reason: string) =>
  new StageFailure({ reason: { tag: "Unspecifiable", message: reason } });

const specSetup = (step: PortStep<SpecWriter["Service"]>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<StageInput>(),
      output: types<OutcomeOf<"spec">>(),
    },
    actors: {
      write: step((specWriter, task: WriteTask) => specWriter.write(task)),
    },
    states: {
      checkingKind: { type: "choice" },
      writing: { schemas: { input: types<Classified>() } },
      written: { type: "final", schemas: { input: types<{ readonly specRef: string }>() } },
    },
  });

const specMachine = (step: PortStep<SpecWriter["Service"]>) =>
  specSetup(step).createMachine({
    id: "spec",
    context: ({ input }) => input,
    initial: "checkingKind",
    states: {
      checkingKind: {
        type: "choice",
        // The lifecycle sends an unclassified work item to Intake, so a null kind means a lifecycle that skips Intake.
        choice: ({ context }) => {
          if (context.kind === null) {
            throw unclassified();
          }
          return { target: "writing", input: { kind: context.kind } };
        },
      },
      writing: {
        invoke: {
          id: "write",
          src: "write",
          input: writeTask,
          onDone: ({ event: { output } }) => {
            if (output._tag === "unclear") {
              throw unspecifiable(output.reason);
            }
            return { target: "written", input: { specRef: output.specRef } };
          },
        },
      },
      written: {
        type: "final",
        output: ({ input }) => ({ _tag: "written", specRef: input.specRef }),
      },
    },
  });

/**
 * The Spec stage machine, writing the work item's expected behaviour with the
 * `SpecWriter` in context and finishing with the reference it returns. Fails
 * with a `StageFailure` when the work item has no kind, the writer finds the
 * issue unclear, or the writer cannot finish.
 */
export const specStage = portStage(SpecWriter, specMachine);

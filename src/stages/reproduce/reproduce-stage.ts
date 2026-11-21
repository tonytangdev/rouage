import { Effect } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { stageInputContext } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import { briefOf } from "../run-brief.ts";
import { sandboxMissing } from "../sandbox-missing.ts";
import type { CaptureTask, ConfirmTask } from "./reproducer.ts";
import { Reproducer } from "./reproducer.ts";

interface Sandboxed {
  readonly sandboxRef: string;
}

const captureTask = ({
  context,
  input,
}: {
  readonly context: StageInput;
  readonly input: Sandboxed;
}): CaptureTask => ({
  ...briefOf(context),
  issueRef: context.issueRef,
  specRef: context.specRef,
  sandboxRef: input.sandboxRef,
  sampleRef: context.sampleRef,
  sampleRequest: context.sampleRequest,
  previousReproductionRef: context.reproductionRef,
});

const capture = (reproducer: Reproducer["Service"], task: CaptureTask) =>
  Effect.map(reproducer.capture(task), (captured) => ({ sandboxRef: task.sandboxRef, captured }));

const confirm = (reproducer: Reproducer["Service"], task: ConfirmTask) =>
  Effect.map(reproducer.confirm(task), (confirmation) => ({
    reproductionRef: task.reproductionRef,
    confirmation,
  }));

const reproduceSetup = (step: PortStep<Reproducer["Service"]>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: stageInputContext,
      output: types<OutcomeOf<"reproduce">>(),
    },
    actors: {
      capture: step(capture),
      confirm: step(confirm),
    },
    states: {
      checkingSandbox: { type: "choice" },
      capturing: { schemas: { input: types<Sandboxed>() } },
      confirming: { schemas: { input: types<ConfirmTask>() } },
      finished: { type: "final", schemas: { input: types<OutcomeOf<"reproduce">>() } },
    },
  });

const reproduceMachine = (step: PortStep<Reproducer["Service"]>) =>
  reproduceSetup(step).createMachine({
    id: "reproduce",
    context: ({ input }) => input,
    initial: "checkingSandbox",
    states: {
      checkingSandbox: {
        type: "choice",
        choice: ({ context }) => {
          if (context.sandboxRef === null) {
            throw sandboxMissing("Reproduce");
          }
          return { target: "capturing", input: { sandboxRef: context.sandboxRef } };
        },
      },
      capturing: {
        invoke: {
          id: "capture",
          src: "capture",
          input: captureTask,
          onDone: ({ context, event: { output } }) => {
            const { captured } = output;
            if (captured._tag !== "captured") {
              return { target: "finished", input: captured };
            }
            return {
              target: "confirming",
              input: {
                workItemId: context.workItemId,
                sandboxRef: output.sandboxRef,
                reproductionRef: captured.reproductionRef,
              },
            };
          },
        },
      },
      confirming: {
        invoke: {
          id: "confirm",
          src: "confirm",
          input: ({ input }) => input,
          onDone: ({ event: { output } }) => {
            const { reproductionRef, confirmation } = output;
            return {
              target: "finished",
              input:
                confirmation._tag === "passed"
                  ? { _tag: "checkPassed", reproductionRef, output: confirmation.output }
                  : { _tag: "reproduced", reproductionRef },
            };
          },
        },
      },
      finished: { type: "final", output: ({ input }) => input },
    },
  });

/**
 * The Reproduce stage machine: captures a bug's reproduction with the
 * `Reproducer` in context, then confirms its check fails in the sandbox
 * (ADR 0006), finishing with the reference once it does, or with
 * `checkPassed`, the reference and what the check printed when it passes
 * (ADR 0009). When the capture asks for a sample or finds the bug cannot be
 * reproduced, finishes with that answer and confirms nothing. Fails when
 * there is no sandbox or the reproducer cannot finish a step.
 */
export const reproduceStage = portStage(Reproducer, reproduceMachine);

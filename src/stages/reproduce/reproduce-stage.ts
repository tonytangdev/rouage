import { Effect } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import type { CaptureTask, ConfirmTask } from "./reproducer.ts";
import { Reproducer } from "./reproducer.ts";

interface Sandboxed {
  readonly sandboxRef: string;
}

const sandboxMissing = () =>
  new StageFailure({
    reason: {
      tag: "SandboxMissing",
      message:
        "Reproduce started without a sandbox; send the work item back to Spec so Provision prepares one",
    },
  });

const captureTask = ({
  context,
  input,
}: {
  readonly context: StageInput;
  readonly input: Sandboxed;
}): CaptureTask => ({
  workItemId: context.workItemId,
  issueRef: context.issueRef,
  specRef: context.specRef,
  sandboxRef: input.sandboxRef,
  sampleRef: context.sampleRef,
  sampleRequest: context.sampleRequest,
  previousReproductionRef: context.reproductionRef,
});

const capture = (reproducer: Reproducer["Service"], task: CaptureTask) =>
  Effect.map(reproducer.capture(task), (captured) => ({ sandboxRef: task.sandboxRef, captured }));

const reproductionDidNotFail = (reproductionRef: string, output: string) =>
  new StageFailure({
    reason: {
      tag: "ReproductionDidNotFail",
      message: `The reproduction ${reproductionRef} passed, so it does not show the bug: ${output}`,
    },
  });

const confirm = (reproducer: Reproducer["Service"], task: ConfirmTask) =>
  Effect.map(reproducer.confirm(task), (confirmation) => ({
    reproductionRef: task.reproductionRef,
    confirmation,
  }));

const reproduceSetup = (step: PortStep<Reproducer["Service"]>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<StageInput>(),
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
        // The lifecycle runs Provision before Reproduce, so a null sandbox means a lifecycle that skips Provision.
        choice: ({ context }) => {
          if (context.sandboxRef === null) {
            throw sandboxMissing();
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
            if (confirmation._tag === "passed") {
              throw reproductionDidNotFail(reproductionRef, confirmation.output);
            }
            return { target: "finished", input: { _tag: "reproduced", reproductionRef } };
          },
        },
      },
      finished: { type: "final", output: ({ input }) => input },
    },
  });

/**
 * The Reproduce stage machine: captures a bug's reproduction with the
 * `Reproducer` in context, then confirms its check fails in the sandbox
 * (ADR 0006), finishing with the reference once it does. When the capture
 * asks for a sample or finds the bug cannot be reproduced, finishes with that
 * answer and confirms nothing. Fails with a `StageFailure` when there is no
 * sandbox, the check passes, or the reproducer cannot finish a step.
 */
export const reproduceStage = portStage(Reproducer, reproduceMachine);

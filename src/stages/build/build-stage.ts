import { Config, Effect } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure } from "../../lifecycle/stage.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import { briefOf } from "../run-brief.ts";
import { sandboxMissing } from "../sandbox-missing.ts";
import type { BuildTask, FixTask, ReproductionCheckTask } from "./builder.ts";
import { Builder } from "./builder.ts";

interface BuildContext {
  readonly input: StageInput;
  readonly fixAttempts: number;
  readonly fixesMade: number;
  readonly reproductionCheck: ReproductionCheckTask | null;
}

export interface BuildOptions {
  /** How many times the builder may fix failing tests or a failing reproduction before Build fails. */
  readonly fixAttempts?: number;
}

const buildTask = ({ context }: { readonly context: BuildContext }): BuildTask => ({
  ...briefOf(context.input),
  planRef: context.input.planRef,
  reproductionRef: context.input.reproductionRef,
  changeRequest: context.input.changeRequest,
});

const fixTask = ({
  context,
  input,
}: {
  readonly context: BuildContext;
  readonly input: { readonly failures: string };
}): FixTask => ({ workItemId: context.input.workItemId, failures: input.failures });

const reproductionMissing = new StageFailure({
  reason: {
    tag: "ReproductionMissing",
    message:
      "Build started on a bug without a reproduction; send the work item back to Spec so Reproduce captures one",
  },
});

const reproductionCheckOf = (input: StageInput): ReproductionCheckTask | null => {
  if (input.kind !== "bug") {
    return null;
  }
  if (input.reproductionRef === null) {
    throw reproductionMissing;
  }
  if (input.sandboxRef === null) {
    throw sandboxMissing("Build");
  }
  return {
    workItemId: input.workItemId,
    sandboxRef: input.sandboxRef,
    reproductionRef: input.reproductionRef,
  };
};

const afterTestsPass = ({ reproductionCheck }: BuildContext) =>
  reproductionCheck === null
    ? ({ target: "built" } as const)
    : ({ target: "checkingReproduction", input: reproductionCheck } as const);

const DEFAULT_FIX_ATTEMPTS = 3;

const resolveFixAttempts = (override: number | undefined) =>
  override === undefined
    ? Config.Int("ROUAGE_MAX_BUILD_FIXES").pipe(Config.withDefault(DEFAULT_FIX_ATTEMPTS))
    : Config.succeed(override);

type StillFailing = "Tests" | "The reproduction";

const attemptsExhausted = (context: BuildContext, failing: StillFailing, failures: string) =>
  new StageFailure({
    reason: {
      tag: "FixAttemptsExhausted",
      message: `${failing} still failed after Build spent its fix-attempt budget of ${context.fixAttempts}: ${failures}`,
    },
  });

const fixOrExhaust = (context: BuildContext, failing: StillFailing, failures: string) => {
  if (context.fixesMade >= context.fixAttempts) {
    throw attemptsExhausted(context, failing, failures);
  }
  return { target: "fixing", input: { failures } } as const;
};

const buildSetup = (step: PortStep<Builder["Service"]>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<BuildContext>(),
      output: types<OutcomeOf<"build">>(),
    },
    actors: {
      implement: step((builder, task: BuildTask) => builder.implement(task)),
      test: step((builder, task: BuildTask) => builder.test(task)),
      fix: step((builder, task: FixTask) => builder.fix(task)),
      checkReproduction: step((builder, task: ReproductionCheckTask) =>
        builder.checkReproduction(task),
      ),
    },
    states: {
      checkingPrerequisites: { type: "choice" },
      implementing: {},
      testing: {},
      checkingReproduction: { schemas: { input: types<ReproductionCheckTask>() } },
      fixing: { schemas: { input: types<{ readonly failures: string }>() } },
      built: { type: "final" },
    },
  });

const buildMachine = (step: PortStep<Builder["Service"]>, fixAttempts: number) =>
  buildSetup(step).createMachine({
    id: "build",
    context: ({ input }) => ({ input, fixAttempts, fixesMade: 0, reproductionCheck: null }),
    initial: "checkingPrerequisites",
    states: {
      checkingPrerequisites: {
        type: "choice",
        choice: ({ context }) => ({
          target: "implementing",
          context: { reproductionCheck: reproductionCheckOf(context.input) },
        }),
      },
      implementing: {
        invoke: {
          id: "implement",
          src: "implement",
          input: buildTask,
          onDone: { target: "testing" },
        },
      },
      testing: {
        invoke: {
          id: "test",
          src: "test",
          input: buildTask,
          onDone: ({ context, event: { output } }) =>
            output._tag === "passed"
              ? afterTestsPass(context)
              : fixOrExhaust(context, "Tests", output.failures),
        },
      },
      checkingReproduction: {
        invoke: {
          id: "checkReproduction",
          src: "checkReproduction",
          input: ({ input }) => input,
          onDone: ({ context, event: { output } }) =>
            output._tag === "passed"
              ? { target: "built" }
              : fixOrExhaust(context, "The reproduction", output.failures),
        },
      },
      fixing: {
        invoke: {
          id: "fix",
          src: "fix",
          input: fixTask,
          onDone: ({ context }) => ({
            target: "testing",
            context: { fixesMade: context.fixesMade + 1 },
          }),
        },
      },
      built: { type: "final", output: { _tag: "built" } },
    },
  });

/**
 * The Build stage machine, running its steps with the `Builder` in context. Fix
 * attempts come from `options`, then `ROUAGE_MAX_BUILD_FIXES`, then
 * `DEFAULT_FIX_ATTEMPTS`; each Build run keeps the number it started with, so a
 * restart never moves the budget of a run in flight. For a bug, finishes only
 * once the reproduction's check passes too, fixing it within the same budget
 * (ADR 0010). Fails with a `StageFailure` when the builder cannot finish a
 * step, the tests or the reproduction still fail after the last fix attempt,
 * or a bug arrives without its reproduction or sandbox.
 */
export const buildStage = Effect.fnUntraced(function* (options: BuildOptions = {}) {
  const fixAttempts = yield* resolveFixAttempts(options.fixAttempts);
  return yield* portStage(Builder, (step) => buildMachine(step, fixAttempts));
});

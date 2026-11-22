import { Config, Effect, Schema } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput } from "../../lifecycle/stage.ts";
import { StageFailure, StageInputSchema } from "../../lifecycle/stage.ts";
import { builtChangeTask } from "../built-change.ts";
import type { PortStep } from "../port-stage.ts";
import { portStage } from "../port-stage.ts";
import type { BuildTask, FixTask, ReproductionCheckTask } from "./builder.ts";
import { BuildTaskSchema, Builder, FixTaskSchema, ReproductionCheckTaskSchema } from "./builder.ts";

// A Schema, so a Build restored mid-run with a context saved before it changed fails to restore (ADR 0014).
const BuildContextSchema = Schema.Struct({
  input: StageInputSchema,
  task: BuildTaskSchema,
  fixAttempts: Schema.Int,
  fixesMade: Schema.Int,
  reproductionCheck: Schema.NullOr(ReproductionCheckTaskSchema),
});
type BuildContext = typeof BuildContextSchema.Type;

// A Schema, so a Build restored mid-fix with failures saved before their shape changed fails to restore (ADR 0017).
const FailuresSchema = Schema.Struct({ failures: Schema.String });

export interface BuildOptions {
  /** How many times the builder may fix failing tests or a failing reproduction before Build fails. */
  readonly fixAttempts?: number;
}

const buildTaskOf = (input: StageInput): BuildTask => {
  const task = builtChangeTask("Build", input, { changeRequest: input.changeRequest });
  if (task instanceof StageFailure) {
    throw task;
  }
  return task;
};

const buildTask = ({ context }: { readonly context: BuildContext }): BuildTask => context.task;

const fixTask = ({
  context,
  input,
}: {
  readonly context: BuildContext;
  readonly input: typeof FailuresSchema.Type;
}): FixTask => ({ ...context.task, failures: input.failures });

const reproductionMissing = new StageFailure({
  reason: {
    tag: "ReproductionMissing",
    message:
      "Build started on a bug without a reproduction; send the work item back to Spec so Reproduce captures one",
  },
});

const reproductionCheckOf = (task: BuildTask): ReproductionCheckTask | null => {
  if (task.kind !== "bug") {
    return null;
  }
  if (task.reproductionRef === null) {
    throw reproductionMissing;
  }
  return {
    workItemId: task.workItemId,
    sandboxRef: task.sandboxRef,
    reproductionRef: task.reproductionRef,
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
      context: Schema.toStandardSchemaV1(BuildContextSchema),
      output: types<OutcomeOf<"build">>(),
    },
    actors: {
      implement: step(BuildTaskSchema, (builder, task) => builder.implement(task)),
      test: step(BuildTaskSchema, (builder, task) => builder.test(task)),
      fix: step(FixTaskSchema, (builder, task) => builder.fix(task)),
      checkReproduction: step(ReproductionCheckTaskSchema, (builder, task) =>
        builder.checkReproduction(task),
      ),
    },
    states: {
      checkingPrerequisites: { type: "choice" },
      implementing: {},
      testing: {},
      checkingReproduction: {
        schemas: { input: Schema.toStandardSchemaV1(ReproductionCheckTaskSchema) },
      },
      fixing: { schemas: { input: Schema.toStandardSchemaV1(FailuresSchema) } },
      built: { type: "final" },
    },
  });

const startingContext = (input: StageInput, fixAttempts: number): BuildContext => ({
  input,
  task: buildTaskOf(input),
  fixAttempts,
  fixesMade: 0,
  reproductionCheck: null,
});

const buildMachine = (step: PortStep<Builder["Service"]>, fixAttempts: number) =>
  buildSetup(step).createMachine({
    id: "build",
    context: ({ input }) => startingContext(input, fixAttempts),
    initial: "checkingPrerequisites",
    states: {
      checkingPrerequisites: {
        type: "choice",
        choice: ({ context }) => ({
          target: "implementing",
          context: { reproductionCheck: reproductionCheckOf(context.task) },
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
 * or the work item arrives without a sandbox, or a bug without its reproduction.
 */
export const buildStage = Effect.fnUntraced(function* (options: BuildOptions = {}) {
  const fixAttempts = yield* resolveFixAttempts(options.fixAttempts);
  return yield* portStage(Builder, (step) => buildMachine(step, fixAttempts));
});

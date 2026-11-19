import type { Context } from "effect";
import { Config, Effect } from "effect";
import { setup, types } from "xstate";

import type { BuildFailed, BuildTask, FixTask } from "../plugins/builder.ts";
import { Builder } from "../plugins/builder.ts";
import { effectStep } from "./effect-step.ts";
import type { OutcomeOf, StageInput } from "./stage.ts";
import { StageFailure } from "./stage.ts";

interface BuildContext {
  readonly input: StageInput;
  readonly fixAttempts: number;
  readonly fixesMade: number;
}

export interface BuildOptions {
  /** How many times the builder may fix failing tests before Build fails. */
  readonly fixAttempts?: number;
}

const buildTask = ({ context }: { readonly context: BuildContext }): BuildTask => ({
  workItemId: context.input.workItemId,
  feedback: context.input.feedback,
});

const stageFailureOf = (error: BuildFailed) =>
  new StageFailure({ reason: { tag: error._tag, message: error.message } });

const builderStep = <Input, Output>(
  services: Context.Context<Builder>,
  step: (builder: Builder["Service"], input: Input) => Effect.Effect<Output, BuildFailed>,
) =>
  effectStep(services, (input: Input) =>
    Builder.use((builder) => step(builder, input)).pipe(Effect.mapError(stageFailureOf)),
  );

const DEFAULT_FIX_ATTEMPTS = 3;

const resolveFixAttempts = (override: number | undefined) =>
  override === undefined
    ? Config.Int("ROUAGE_MAX_BUILD_FIXES").pipe(Config.withDefault(DEFAULT_FIX_ATTEMPTS))
    : Config.succeed(override);

const attemptsExhausted = (context: BuildContext, failures: string) =>
  new StageFailure({
    reason: {
      tag: "FixAttemptsExhausted",
      message: `Tests still failed after Build spent its fix-attempt budget of ${context.fixAttempts}: ${failures}`,
    },
  });

const buildSetup = (services: Context.Context<Builder>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<BuildContext>(),
      output: types<OutcomeOf<"build">>(),
    },
    actors: {
      implement: builderStep(services, (builder, task: BuildTask) => builder.implement(task)),
      test: builderStep(services, (builder, task: BuildTask) => builder.test(task)),
      fix: builderStep(services, (builder, task: FixTask) => builder.fix(task)),
    },
    states: {
      implementing: {},
      testing: {},
      fixing: { schemas: { input: types<{ readonly failures: string }>() } },
      built: { type: "final" },
    },
  });

const buildMachine = (services: Context.Context<Builder>, fixAttempts: number) =>
  buildSetup(services).createMachine({
    id: "build",
    context: ({ input }) => ({ input, fixAttempts, fixesMade: 0 }),
    initial: "implementing",
    states: {
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
          onDone: ({ context, event: { output } }) => {
            if (output._tag === "passed") {
              return { target: "built" };
            }
            if (context.fixesMade >= context.fixAttempts) {
              throw attemptsExhausted(context, output.failures);
            }
            return { target: "fixing", input: { failures: output.failures } };
          },
        },
      },
      fixing: {
        invoke: {
          id: "fix",
          src: "fix",
          input: ({ context, input }) => ({
            workItemId: context.input.workItemId,
            failures: input.failures,
          }),
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
 * restart never moves the budget of a run in flight. Fails with a
 * `StageFailure` when the builder cannot finish a step or the tests still fail
 * after the last fix attempt.
 */
export const buildStage = Effect.fnUntraced(function* (options: BuildOptions = {}) {
  const services = yield* Effect.context<Builder>();
  return buildMachine(services, yield* resolveFixAttempts(options.fixAttempts));
});

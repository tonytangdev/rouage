import type { Context } from "effect";
import { Config, Effect } from "effect";
import { setup, types } from "xstate";

import type { AgentFailed, BuildTask, FixTask } from "../plugins/agent.ts";
import { Agent } from "../plugins/agent.ts";
import { effectStep } from "./effect-step.ts";
import type { OutcomeOf, StageInput } from "./stage.ts";
import { StageFailure } from "./stage.ts";

interface BuildContext {
  readonly input: StageInput;
  readonly fixAttempts: number;
  readonly fixesMade: number;
}

export interface BuildOptions {
  /** How many times the agent may fix failing tests before Build fails. */
  readonly fixAttempts?: number;
}

const buildTask = ({ context }: { readonly context: BuildContext }): BuildTask => ({
  workItemId: context.input.workItemId,
  feedback: context.input.feedback,
});

const stageFailureOf = (error: AgentFailed) =>
  new StageFailure({ reason: { tag: error._tag, message: error.message } });

const agentStep = <Input, Output>(
  services: Context.Context<Agent>,
  step: (agent: Agent["Service"], input: Input) => Effect.Effect<Output, AgentFailed>,
) =>
  effectStep(services, (input: Input) =>
    Agent.use((agent) => step(agent, input)).pipe(Effect.mapError(stageFailureOf)),
  );

const resolveFixAttempts = (override: number | undefined) =>
  override === undefined
    ? Config.Int("ROUAGE_MAX_BUILD_FIXES").pipe(Config.withDefault(3))
    : Config.succeed(override);

const attemptsExhausted = (context: BuildContext, failures: string) =>
  new StageFailure({
    reason: {
      tag: "FixAttemptsExhausted",
      message: `Tests still failed after ${context.fixAttempts} fix attempts: ${failures}`,
    },
  });

const buildSetup = (services: Context.Context<Agent>) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<BuildContext>(),
      output: types<OutcomeOf<"build">>(),
    },
    actors: {
      implement: agentStep(services, (agent, task: BuildTask) => agent.implement(task)),
      test: agentStep(services, (agent, task: BuildTask) => agent.test(task)),
      fix: agentStep(services, (agent, task: FixTask) => agent.fix(task)),
    },
    states: {
      implementing: {},
      testing: {},
      fixing: { schemas: { input: types<{ readonly failures: string }>() } },
      built: { type: "final" },
    },
  });

const buildMachine = (services: Context.Context<Agent>, fixAttempts: number) =>
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
 * The Build stage machine: implement, then test and fix until the tests pass.
 * Each step runs with the `Agent` in context. The fix attempts come from
 * `options`, then `ROUAGE_MAX_BUILD_FIXES`, then 3, and each Build run keeps
 * the number it started with. Fails with a `StageFailure` when the agent
 * cannot finish a step or the tests still fail after the last fix attempt.
 */
export const buildStage = Effect.fnUntraced(function* (options: BuildOptions = {}) {
  const services = yield* Effect.context<Agent>();
  return buildMachine(services, yield* resolveFixAttempts(options.fixAttempts));
});

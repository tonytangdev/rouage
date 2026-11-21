import type { Context, Effect } from "effect";
import { setup, types } from "xstate";

import type { OutcomeOf, StageInput, StageName } from "../lifecycle/stage.ts";
import { StageFailure } from "../lifecycle/stage.ts";
import type { PortGaveUp, PortStep } from "./port-stage.ts";
import { portStage } from "./port-stage.ts";

/** A stage that asks its port one thing and finishes with what the answer means. */
export interface SingleStep<Stage extends StageName, Port, Task, Answer> {
  readonly stage: Stage;
  /** The port's task for this run, or the `StageFailure` that stops the stage before it asks. */
  readonly task: (input: StageInput) => Task | StageFailure;
  readonly ask: (port: Port, task: Task) => Effect.Effect<Answer, PortGaveUp>;
  /** The stage's outcome for the port's answer, or the `StageFailure` the answer means. */
  readonly outcome: (answer: Answer) => OutcomeOf<Stage> | StageFailure;
}

const unlessFailure = <A>(result: A | StageFailure): A => {
  if (result instanceof StageFailure) {
    throw result;
  }
  return result;
};

const singleStepSetup = <Stage extends StageName, Port, Task, Answer>(
  step: PortStep<Port>,
  spec: SingleStep<Stage, Port, Task, Answer>,
) =>
  setup({
    schemas: {
      input: types<StageInput>(),
      context: types<StageInput>(),
      output: types<OutcomeOf<Stage>>(),
    },
    actors: { ask: step(spec.ask) },
    states: {
      preparing: { type: "choice" },
      asking: { schemas: { input: types<{ readonly task: Task }>() } },
      finished: {
        type: "final",
        schemas: { input: types<{ readonly outcome: OutcomeOf<Stage> }>() },
      },
    },
  });

const singleStepMachine = <Stage extends StageName, Port, Task, Answer>(
  step: PortStep<Port>,
  spec: SingleStep<Stage, Port, Task, Answer>,
) =>
  singleStepSetup(step, spec).createMachine({
    id: spec.stage,
    context: ({ input }) => input,
    initial: "preparing",
    states: {
      preparing: {
        type: "choice",
        choice: ({ context }) => ({
          target: "asking",
          input: { task: unlessFailure(spec.task(context)) },
        }),
      },
      asking: {
        invoke: {
          id: "ask",
          src: "ask",
          input: ({ input }) => input.task,
          onDone: ({ event: { output } }) => ({
            target: "finished",
            input: { outcome: unlessFailure(spec.outcome(output)) },
          }),
        },
      },
      finished: { type: "final", output: ({ input }) => input.outcome },
    },
  });

/**
 * Builds the stage machine for a stage that asks the port behind `port` one
 * thing: it prepares the task, asks once, and finishes with the outcome the
 * answer means. Fails with a `StageFailure` when the task or the answer is
 * one, or with the port's reason when the port gives up. A restore while
 * asking asks again with the same task.
 */
export const singleStepStage = <Id, Stage extends StageName, Port, Task, Answer>(
  port: Context.Key<Id, Port>,
  spec: SingleStep<Stage, Port, Task, Answer>,
) => portStage(port, (step) => singleStepMachine(step, spec));

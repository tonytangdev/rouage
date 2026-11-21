import type { Context } from "effect";
import { Effect } from "effect";
import type { AsyncActorLogic } from "xstate";
import { createAsyncLogic } from "xstate";

import { StageFailure } from "../lifecycle/stage.ts";
import type { TaskSchema } from "../lifecycle/step-task.ts";
import { withTaskSchema } from "../lifecycle/step-task.ts";

/** How a port fails when it cannot carry out a step: a tagged error with a message for the human who unblocks the work item. */
export interface PortGaveUp {
  readonly _tag: string;
  readonly message: string;
}

/**
 * Turns one call to a port into actor logic a stage machine can invoke, given
 * the task the call takes as `task`: it finishes with the call's result, fails
 * with a `StageFailure` carrying the port's tag and message when the port
 * gives up, is interrupted when the invoking state is left, and errors as a
 * crash on a defect. A work item restored while the step runs is refused
 * when the task it was saved with no longer fits `task` (ADR 0016).
 */
export type PortStep<Port> = <Input, Output>(
  task: TaskSchema<Input>,
  call: (port: Port, input: Input) => Effect.Effect<Output, PortGaveUp>,
) => AsyncActorLogic<Output, Input>;

const blockingFailure = (error: PortGaveUp) =>
  new StageFailure({ reason: { tag: error._tag, message: error.message } });

/** Builds a stage machine whose steps call `port`, taken from the Effect context. */
export const portStage = Effect.fnUntraced(function* <Id, Port, Machine>(
  port: Context.Key<Id, Port>,
  machine: (step: PortStep<Port>) => Machine,
) {
  const implementation = yield* port;
  const surrounding = yield* Effect.context();
  return machine((task, call) =>
    withTaskSchema(
      createAsyncLogic({
        run: ({ input, signal }) =>
          Effect.runPromiseWith(surrounding)(
            call(implementation, input).pipe(Effect.mapError(blockingFailure)),
            { signal },
          ),
      }),
      task,
    ),
  );
});

import type { Context } from "effect";
import { Effect } from "effect";
import { createAsyncLogic } from "xstate";

import { StageFailure } from "./stage.ts";

/** How a port fails when it cannot carry out a step: a tagged error with a message for the human who unblocks the work item. */
export interface PortGaveUp {
  readonly _tag: string;
  readonly message: string;
}

const blockingFailure = (error: PortGaveUp) =>
  new StageFailure({ reason: { tag: error._tag, message: error.message } });

/**
 * Actor logic that runs `program` against the ports in `services` and
 * finishes with its result, so a stage machine can invoke a port and get the
 * result back as its done event. A port giving up fails the step with a
 * `StageFailure` carrying the port's tag and message. The program is
 * interrupted when the invoking state is left, and a defect errors the actor
 * as a crash.
 */
export const portStep = <Input, Output, Services>(
  services: Context.Context<Services>,
  program: (input: Input) => Effect.Effect<Output, PortGaveUp, Services>,
) =>
  createAsyncLogic<Output, Input>({
    run: ({ input, signal }) =>
      Effect.runPromiseWith(services)(program(input).pipe(Effect.mapError(blockingFailure)), {
        signal,
      }),
  });

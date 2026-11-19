import type { Context } from "effect";
import { Effect } from "effect";
import { createAsyncLogic } from "xstate";

import type { StageFailure } from "./stage.ts";

/**
 * Actor logic that runs `program` with `services` and finishes with its
 * result, so a machine can invoke an Effect program and get the result back as
 * its done event. The program is interrupted when the invoking state is left,
 * and a defect errors the actor as a crash.
 */
export const effectStep = <Input, Output, Services>(
  services: Context.Context<Services>,
  program: (input: Input) => Effect.Effect<Output, StageFailure, Services>,
) =>
  createAsyncLogic<Output, Input>({
    run: ({ input, signal }) => Effect.runPromiseWith(services)(program(input), { signal }),
  });

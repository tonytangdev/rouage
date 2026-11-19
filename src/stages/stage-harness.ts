import { Effect, Function } from "effect";
import type { Actor, AnyActorLogic, OutputFrom } from "xstate";
import { toPromise } from "xstate";

import type { Settled } from "../lifecycle/stage-contract.ts";
import type { StageInput } from "../lifecycle/stage.ts";

/** The input a stage run alone starts with. */
export const aloneInput: StageInput = {
  workItemId: "wi-1",
  issueRef: "#1",
  kind: null,
  feedback: null,
  specRef: null,
  sandboxRef: null,
  sampleRequest: null,
  sampleRef: null,
};

/** Starts a stage actor outside any lifecycle and waits until it finishes or fails; the actor stops when the test's scope closes. */
export const runAlone = Effect.fnUntraced(function* <Logic extends AnyActorLogic>(
  actor: Actor<Logic>,
) {
  // A root actor's error with no error observer is reported to the host as unhandled.
  actor.subscribe({ error: Function.constVoid });
  yield* Effect.acquireRelease(
    Effect.sync(() => actor.start()),
    (running) => Effect.sync(() => running.stop()),
  );
  return yield* Effect.promise((): Promise<Settled<OutputFrom<Actor<Logic>>>> =>
    toPromise(actor).then(
      (output) => ({ output, error: undefined }),
      (error: unknown) => ({ output: undefined, error }),
    ),
  );
});

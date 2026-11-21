import { Effect, Layer } from "effect";

import type { FakePort, Misbehaving } from "../fake-script.ts";
import { scriptedAnswers, scriptedPort } from "../fake-script.ts";
import type { CaptureTask, Captured, ConfirmTask, Confirmation } from "./reproducer.ts";
import { Reproducer, ReproducerGaveUp } from "./reproducer.ts";

export type ReproduceStep = "capture" | "confirm";

/** One request the reproducer received, with the task it was given. */
export type ReproduceCall =
  | { readonly step: "capture"; readonly task: CaptureTask }
  | { readonly step: "confirm"; readonly task: ConfirmTask };

/** The reproducer as its fake and the stage contract suite know it. */
export const reproducerPort: FakePort<ReproduceStep, ReproducerGaveUp> = {
  port: "reproducer",
  steps: ["capture", "confirm"],
  gaveUp: (message) => new ReproducerGaveUp({ message }),
};

export interface FakeReproducerScript {
  /** What each capture returns, in order. */
  readonly captures: readonly Captured[];
  /** What each confirm returns, in order. */
  readonly confirmations?: readonly Confirmation[];
  readonly misbehaving?: Misbehaving<ReproduceStep> | undefined;
}

/** A reproducer that follows a script instead of calling an AI. */
export const fakeReproducer = Effect.fnUntraced(function* (script: FakeReproducerScript) {
  const port = yield* scriptedPort<ReproduceStep, ReproduceCall, ReproducerGaveUp>({
    ...reproducerPort,
    misbehaving: script.misbehaving,
  });
  const captures = scriptedAnswers(script.captures, "reproducer's capture");
  const confirmations = scriptedAnswers(script.confirmations ?? [], "reproducer's confirm");
  const reproducer = Reproducer.of({
    capture: (task) => port.run({ step: "capture", task }, captures),
    confirm: (task) => port.run({ step: "confirm", task }, confirmations),
  });
  return {
    layer: Layer.succeed(Reproducer, reproducer),
    calls: port.calls,
    started: port.started,
  };
});

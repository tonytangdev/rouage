import { Effect, Function } from "effect";
import { createActor, waitFor } from "xstate";

import type { FakeClassifierScript } from "../plugins/fake-classifier.ts";
import { fakeClassifier } from "../plugins/fake-classifier.ts";
import { intakeStage } from "./intake-stage.ts";

export const isBug = { _tag: "bug" } as const;
export const isFeature = { _tag: "feature" } as const;
export const isUnclear = {
  _tag: "unclear",
  reason: "The issue asks for a change without saying what is wrong today",
} as const;

export const scriptedIntake = Effect.fnUntraced(function* (script: FakeClassifierScript) {
  const classifier = yield* fakeClassifier(script);
  return { classifier, intake: yield* intakeStage().pipe(Effect.provide(classifier.layer)) };
});

/** Runs an Intake stage outside any lifecycle until it finishes or fails; the actor stops when the test's scope closes. */
export const runIntake = Effect.fnUntraced(function* (script: FakeClassifierScript) {
  const { classifier, intake } = yield* scriptedIntake(script);
  const actor = createActor(intake, {
    input: { workItemId: "wi-1", issueRef: "#1", kind: null, feedback: null },
  });
  // A root actor's error with no error observer is reported to the host as unhandled.
  actor.subscribe({ error: Function.constVoid });
  const started = yield* Effect.acquireRelease(
    Effect.sync(() => actor.start()),
    (running) => Effect.sync(() => running.stop()),
  );
  // A failed Intake rejects the wait; the snapshot read next records how it failed.
  yield* Effect.tryPromise(() => waitFor(started, (snapshot) => snapshot.status !== "active")).pipe(
    Effect.ignore,
  );
  return { snapshot: started.getSnapshot(), calls: classifier.calls() };
});

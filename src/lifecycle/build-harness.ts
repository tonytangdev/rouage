import { Effect, Function } from "effect";
import { createActor, waitFor } from "xstate";

import type { FakeBuilderScript } from "../plugins/fake-builder.ts";
import { fakeBuilder } from "../plugins/fake-builder.ts";
import type { BuildOptions } from "./build-stage.ts";
import { buildStage } from "./build-stage.ts";

export const testsPassed = { _tag: "passed" } as const;
export const testsFailed = { _tag: "failed", failures: "1 test failed: totals add VAT" } as const;

export const scriptedBuild = Effect.fnUntraced(function* (
  script: FakeBuilderScript,
  options: BuildOptions = {},
) {
  const builder = yield* fakeBuilder(script);
  return { builder, build: yield* buildStage(options).pipe(Effect.provide(builder.layer)) };
});

/** Runs a Build stage outside any lifecycle until it finishes or fails; the actor stops when the test's scope closes. */
export const runBuild = Effect.fnUntraced(function* (
  script: FakeBuilderScript,
  options: BuildOptions = {},
) {
  const { builder, build } = yield* scriptedBuild(script, options);
  const actor = createActor(build, {
    input: { workItemId: "wi-1", kind: "feature", feedback: null },
  });
  // A root actor's error with no error observer is reported to the host as unhandled.
  actor.subscribe({ error: Function.constVoid });
  const started = yield* Effect.acquireRelease(
    Effect.sync(() => actor.start()),
    (running) => Effect.sync(() => running.stop()),
  );
  // A failed Build rejects the wait; the snapshot read next records how it failed.
  yield* Effect.tryPromise(() => waitFor(started, (snapshot) => snapshot.status !== "active")).pipe(
    Effect.ignore,
  );
  return { snapshot: started.getSnapshot(), steps: builder.steps(), calls: builder.calls() };
});

import { Effect, Function } from "effect";
import { createActor, waitFor } from "xstate";

import type { FakeAgentScript } from "../plugins/fake-agent.ts";
import { fakeAgent } from "../plugins/fake-agent.ts";
import type { BuildOptions } from "./build-stage.ts";
import { buildStage } from "./build-stage.ts";

export const testsPassed = { _tag: "passed" } as const;
export const testsFailed = { _tag: "failed", failures: "1 test failed: totals add VAT" } as const;

/** A Build stage whose agent follows `script`, with that agent for inspecting the steps it ran. */
export const scriptedBuild = Effect.fnUntraced(function* (
  script: FakeAgentScript,
  options: BuildOptions = {},
) {
  const agent = yield* fakeAgent(script);
  return { agent, build: yield* buildStage(options).pipe(Effect.provide(agent.layer)) };
});

/** Runs a Build stage on its own until it finishes or fails, for the length of the test. */
export const runBuild = Effect.fnUntraced(function* (
  script: FakeAgentScript,
  options: BuildOptions = {},
) {
  const { agent, build } = yield* scriptedBuild(script, options);
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
  return { snapshot: started.getSnapshot(), steps: agent.steps() };
});

import { describe, expect, it } from "@effect/vitest";
import { Effect, Function } from "effect";
import { createActor, waitFor } from "xstate";

import type { FakeAgentScript } from "../plugins/fake-agent.ts";
import { fakeAgent } from "../plugins/fake-agent.ts";
import type { BuildOptions } from "./build-stage.ts";
import { buildStage } from "./build-stage.ts";
import { failureReasonOf } from "./stage.ts";

const input = { workItemId: "wi-1", kind: "feature" as const, feedback: null };

const passed = { _tag: "passed" } as const;
const failed = { _tag: "failed", failures: "1 test failed: totals add VAT" } as const;

const runBuild = Effect.fnUntraced(function* (script: FakeAgentScript, options: BuildOptions = {}) {
  const agent = yield* fakeAgent(script);
  const logic = yield* buildStage(options).pipe(Effect.provide(agent.layer));
  const actor = createActor(logic, { input });
  // A root actor's error with no error observer is reported to the host as unhandled.
  actor.subscribe({ error: Function.constVoid });
  const started = yield* Effect.acquireRelease(
    Effect.sync(() => actor.start()),
    (running) => Effect.sync(() => running.stop()),
  );
  yield* Effect.tryPromise(() => waitFor(started, (snapshot) => snapshot.status !== "active")).pipe(
    Effect.ignore,
  );
  return { snapshot: started.getSnapshot(), steps: agent.steps() };
});

describe("build stage", () => {
  it.effect("finishes built when the tests pass after implementing", () =>
    Effect.gen(function* () {
      const { snapshot, steps } = yield* runBuild({ testReports: [passed] });
      expect(snapshot.output).toStrictEqual({ _tag: "built" });
      expect(steps).toStrictEqual(["implement", "test"]);
    }),
  );

  it.effect("fails with a StageFailure when the agent cannot finish a step", () =>
    Effect.gen(function* () {
      const { snapshot } = yield* runBuild({ testReports: [passed], failing: "implement" });
      expect(failureReasonOf(snapshot.error)).toStrictEqual({
        tag: "AgentFailed",
        message: "The agent gave up during implement",
      });
    }),
  );

  it.effect("counts any other error as a crash", () =>
    Effect.gen(function* () {
      const { snapshot } = yield* runBuild({ testReports: [passed], crashing: "test" });
      expect(failureReasonOf(snapshot.error)).toStrictEqual({
        tag: "StageCrashed",
        message: "The agent exited during test",
      });
    }),
  );

  it.effect("fixes and tests again until the tests pass", () =>
    Effect.gen(function* () {
      const { snapshot, steps } = yield* runBuild({ testReports: [failed, failed, passed] });
      expect(snapshot.output).toStrictEqual({ _tag: "built" });
      expect(steps).toStrictEqual(["implement", "test", "fix", "test", "fix", "test"]);
    }),
  );

  it.effect("fails with a StageFailure when the tests still fail after its last fix attempt", () =>
    Effect.gen(function* () {
      const { snapshot, steps } = yield* runBuild(
        { testReports: [failed, failed, failed] },
        { fixAttempts: 2 },
      );
      expect(failureReasonOf(snapshot.error)).toStrictEqual({
        tag: "FixAttemptsExhausted",
        message: "Tests still failed after 2 fix attempts: 1 test failed: totals add VAT",
      });
      expect(steps).toStrictEqual(["implement", "test", "fix", "test", "fix", "test"]);
    }),
  );
});

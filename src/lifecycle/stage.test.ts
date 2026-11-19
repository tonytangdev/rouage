import { describe, expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { Effect, Function } from "effect";
import { createActor } from "xstate";

import { runBuild, testsPassed } from "./build-harness.ts";
import { isBug, runIntake } from "./intake-harness.ts";
import type { FailureReason } from "./stage.ts";
import { failureReasonOf } from "./stage.ts";
import { stubStage } from "./stub-stage.ts";

const input = { workItemId: "wi-1", issueRef: "#1", kind: "bug" as const, feedback: null };

interface Settled {
  readonly output: unknown;
  readonly error: unknown;
}

interface StageAdapter {
  readonly name: string;
  readonly finished: Effect.Effect<Settled, unknown, Scope.Scope>;
  readonly outcome: unknown;
  readonly failed: Effect.Effect<Settled, unknown, Scope.Scope>;
  readonly failure: FailureReason;
  readonly crashed: Effect.Effect<Settled, unknown, Scope.Scope>;
  readonly crashMessage: string;
}

const startReview = Effect.fnUntraced(function* () {
  const actor = createActor(stubStage("review"), { input });
  // A root actor's error with no error observer is reported to the host as unhandled.
  actor.subscribe({ error: Function.constVoid });
  return yield* Effect.acquireRelease(
    Effect.sync(() => actor.start()),
    (started) => Effect.sync(() => started.stop()),
  );
});

const stubAdapter: StageAdapter = {
  name: "stub",
  finished: Effect.gen(function* () {
    const stage = yield* startReview();
    stage.send({ type: "finish", outcome: { _tag: "changesRequested", feedback: "rename" } });
    return stage.getSnapshot();
  }),
  outcome: { _tag: "changesRequested", feedback: "rename" },
  failed: Effect.gen(function* () {
    const stage = yield* startReview();
    stage.send({ type: "fail", reason: { tag: "AgentTimedOut", message: "no answer" } });
    return stage.getSnapshot();
  }),
  failure: { tag: "AgentTimedOut", message: "no answer" },
  crashed: Effect.gen(function* () {
    const stage = yield* startReview();
    stage.send({ type: "crash", message: "agent exited with code 1" });
    return stage.getSnapshot();
  }),
  crashMessage: "agent exited with code 1",
};

const buildAdapter: StageAdapter = {
  name: "build",
  finished: Effect.map(runBuild({ testReports: [testsPassed] }), ({ snapshot }) => snapshot),
  outcome: { _tag: "built" },
  failed: Effect.map(
    runBuild({ testReports: [testsPassed], failing: "implement" }),
    ({ snapshot }) => snapshot,
  ),
  failure: { tag: "BuildFailed", message: "The builder gave up during implement" },
  crashed: Effect.map(
    runBuild({ testReports: [testsPassed], crashing: "test" }),
    ({ snapshot }) => snapshot,
  ),
  crashMessage: "The builder exited during test",
};

const intakeAdapter: StageAdapter = {
  name: "intake",
  finished: Effect.map(runIntake({ results: [isBug] }), ({ snapshot }) => snapshot),
  outcome: { _tag: "classified", kind: "bug" },
  failed: Effect.map(
    runIntake({ results: [isBug], misbehaving: "failing" }),
    ({ snapshot }) => snapshot,
  ),
  failure: { tag: "ClassifyFailed", message: "The classifier gave up on the issue" },
  crashed: Effect.map(
    runIntake({ results: [isBug], misbehaving: "crashing" }),
    ({ snapshot }) => snapshot,
  ),
  crashMessage: "The classifier exited while classifying",
};

for (const adapter of [stubAdapter, buildAdapter, intakeAdapter]) {
  describe(`stage contract, ${adapter.name} adapter`, () => {
    it.effect("finishes with its outcome", () =>
      Effect.gen(function* () {
        const { output } = yield* adapter.finished;
        expect(output).toStrictEqual(adapter.outcome);
      }),
    );

    it.effect("fails with a StageFailure whose reason blocks the work item", () =>
      Effect.gen(function* () {
        const { error } = yield* adapter.failed;
        expect(failureReasonOf(error)).toStrictEqual(adapter.failure);
      }),
    );

    it.effect("counts any other error as a crash", () =>
      Effect.gen(function* () {
        const { error } = yield* adapter.crashed;
        expect(failureReasonOf(error)).toStrictEqual({
          tag: "StageCrashed",
          message: adapter.crashMessage,
        });
      }),
    );
  });
}

import { describe, expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { Effect, Function } from "effect";
import { createActor } from "xstate";

import type { Misbehaving } from "../plugins/fake-script.ts";
import { crashMessage, gaveUpMessage } from "../plugins/fake-script.ts";
import { runBuild, testsPassed } from "./build-harness.ts";
import { isBug, runIntake } from "./intake-harness.ts";
import type { Settled } from "./stage-harness.ts";
import type { FailureReason } from "./stage.ts";
import { failureReasonOf } from "./stage.ts";
import { stubStage } from "./stub-stage.ts";

const input = { workItemId: "wi-1", issueRef: "#1", kind: "bug" as const, feedback: null };

interface StageAdapter {
  readonly name: string;
  readonly finished: Effect.Effect<Settled<unknown>, unknown, Scope.Scope>;
  readonly outcome: unknown;
  readonly failed: Effect.Effect<Settled<unknown>, unknown, Scope.Scope>;
  readonly failure: FailureReason;
  readonly crashed: Effect.Effect<Settled<unknown>, unknown, Scope.Scope>;
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

interface PortStage<Step extends string> {
  readonly name: string;
  readonly port: string;
  readonly gaveUpTag: string;
  readonly firstStep: Step;
  readonly outcome: unknown;
  readonly run: (
    misbehaving?: Misbehaving<Step>,
  ) => Effect.Effect<{ readonly settled: Settled<unknown> }, unknown, Scope.Scope>;
}

// A stage that runs its steps through a port fails and crashes the way its
// port does, so those cases come from making its first step misbehave.
const portAdapter = <Step extends string>(stage: PortStage<Step>): StageAdapter => {
  const settled = (misbehaving?: Misbehaving<Step>) =>
    Effect.map(stage.run(misbehaving), (run) => run.settled);
  return {
    name: stage.name,
    finished: settled(),
    outcome: stage.outcome,
    failed: settled({ step: stage.firstStep, as: "failing" }),
    failure: { tag: stage.gaveUpTag, message: gaveUpMessage(stage.port, stage.firstStep) },
    crashed: settled({ step: stage.firstStep, as: "crashing" }),
    crashMessage: crashMessage(stage.port, stage.firstStep),
  };
};

const buildAdapter = portAdapter({
  name: "build",
  port: "builder",
  gaveUpTag: "BuilderGaveUp",
  firstStep: "implement",
  outcome: { _tag: "built" },
  run: (misbehaving) => runBuild({ testReports: [testsPassed], misbehaving }),
});

const intakeAdapter = portAdapter({
  name: "intake",
  port: "classifier",
  gaveUpTag: "ClassifierGaveUp",
  firstStep: "classify",
  outcome: { _tag: "classified", kind: "bug" },
  run: (misbehaving) => runIntake({ results: [isBug], misbehaving }),
});

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

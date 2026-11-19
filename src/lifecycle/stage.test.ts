import { describe, expect, it } from "@effect/vitest";
import { Effect, Function } from "effect";
import { createActor } from "xstate";

import { failureReasonOf } from "./stage.ts";
import { stubStage } from "./stub-stage.ts";

const input = { workItemId: "wi-1", kind: "bug" as const, feedback: null };

const startReview = Effect.fnUntraced(function* () {
  const actor = createActor(stubStage("review"), { input });
  // A root actor's error with no error observer is reported to the host as unhandled.
  actor.subscribe({ error: Function.constVoid });
  return yield* Effect.acquireRelease(
    Effect.sync(() => actor.start()),
    (started) => Effect.sync(() => started.stop()),
  );
});

describe("stage contract, stub adapter", () => {
  it.effect("finishes with the outcome it is sent", () =>
    Effect.gen(function* () {
      const stage = yield* startReview();
      stage.send({ type: "finish", outcome: { _tag: "changesRequested", feedback: "rename" } });
      expect(stage.getSnapshot().output).toStrictEqual({
        _tag: "changesRequested",
        feedback: "rename",
      });
    }),
  );

  it.effect("fails with a StageFailure whose reason blocks the work item", () =>
    Effect.gen(function* () {
      const stage = yield* startReview();
      stage.send({ type: "fail", reason: { tag: "AgentTimedOut", message: "no answer" } });
      expect(failureReasonOf(stage.getSnapshot().error)).toStrictEqual({
        tag: "AgentTimedOut",
        message: "no answer",
      });
    }),
  );

  it.effect("counts any other error as a crash", () =>
    Effect.gen(function* () {
      const stage = yield* startReview();
      stage.send({ type: "crash", message: "agent exited with code 1" });
      expect(failureReasonOf(stage.getSnapshot().error)).toStrictEqual({
        tag: "StageCrashed",
        message: "agent exited with code 1",
      });
    }),
  );
});

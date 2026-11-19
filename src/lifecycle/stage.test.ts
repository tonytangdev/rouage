import { Effect, Function } from "effect";
import { createActor } from "xstate";

import { describeStageContract } from "./stage-contract.ts";
import type { StageAdapter } from "./stage-contract.ts";
import { stubStage } from "./stub-stage.ts";

const input = { workItemId: "wi-1", issueRef: "#1", kind: "bug" as const, feedback: null };

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

describeStageContract(stubAdapter);

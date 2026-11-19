import { Data, Effect } from "effect";
import type { AnyActorRef } from "xstate";

import { defaultLifecycle } from "./lifecycle.ts";
import type { FailureReason, OutcomeOf, StageInput, StageName } from "./stage.ts";
import type { AttachStub } from "./stub-stage.ts";
import { stubStages } from "./stub-stage.ts";
import type { WorkItem } from "./work-item-actor.ts";
import { createWorkItem, restoreWorkItem } from "./work-item-actor.ts";

/** Thrown when a test drives a stage the work item is not in, so the test fails at the step that went wrong. */
export class StageNotRunning extends Data.TaggedError("StageNotRunning")<{
  readonly stage: StageName;
  readonly actual: string;
}> {}

interface RunningStub {
  readonly self: AnyActorRef;
  readonly input: StageInput;
}

const stubController = () => {
  const running = new Map<StageName, RunningStub>();
  const attach: AttachStub = (stage, self, input) => {
    running.set(stage, { self, input });
    return () => {
      if (running.get(stage)?.self === self) {
        running.delete(stage);
      }
    };
  };
  return { running, lifecycle: defaultLifecycle.provide({ actors: stubStages(attach) }) };
};

const drive = (workItem: WorkItem, running: ReadonlyMap<StageName, RunningStub>) => {
  const stub = (stage: StageName) => {
    const found = running.get(stage);
    if (found === undefined) {
      throw new StageNotRunning({ stage, actual: workItem.state() });
    }
    return found.self;
  };
  return {
    stage: workItem.state,
    status: workItem.status,
    context: workItem.context,
    save: workItem.save,
    send: workItem.send,
    stageInput: (stage: StageName) => running.get(stage)?.input,
    finish: <Stage extends StageName>(stage: Stage, outcome: OutcomeOf<Stage>) => {
      stub(stage).send({ type: "finish", outcome });
    },
    fail: (stage: StageName, reason: FailureReason) => {
      stub(stage).send({ type: "fail", reason });
    },
    crash: (stage: StageName, message: string) => {
      stub(stage).send({ type: "crash", message });
    },
  };
};

/** Starts a work item on the default lifecycle, with loop limits of 3, for the length of the test. */
export const startWorkItem = Effect.fnUntraced(function* () {
  const { running, lifecycle } = stubController();
  const workItem = yield* createWorkItem(lifecycle, {
    id: "wi-1",
    issueRef: "#1",
    limits: { review: 3, reproduce: 3 },
  });
  return drive(workItem, running);
});

/** Resumes a saved work item on the default lifecycle for the length of the test. */
export const restoredWorkItem = Effect.fnUntraced(function* (persisted: unknown) {
  const { running, lifecycle } = stubController();
  return drive(yield* restoreWorkItem(lifecycle, persisted), running);
});

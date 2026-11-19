import { Effect, Predicate } from "effect";
import type { AnyActorRef, EventFrom } from "xstate";

import type { StageName } from "./blocked.ts";
import { defaultLifecycle } from "./lifecycle.ts";
import type { FailureReason } from "./outcomes.ts";
import { innermostState } from "./state-value.ts";
import type { WorkItemActor } from "./work-item-actor.ts";
import { createWorkItem, restoreWorkItem, saveWorkItem } from "./work-item-actor.ts";

const inputOf = (snapshot: unknown): unknown =>
  Predicate.hasProperty(snapshot, "context") && Predicate.hasProperty(snapshot.context, "input")
    ? snapshot.context.input
    : undefined;

const drive = (actor: WorkItemActor) => {
  const child = (stage: StageName) => {
    const children: Partial<Record<StageName, AnyActorRef>> = actor.getSnapshot().children;
    return children[stage];
  };
  return {
    stage: () => innermostState(actor.getSnapshot().value),
    status: () => actor.getSnapshot().status,
    context: () => actor.getSnapshot().context,
    save: () => saveWorkItem(actor),
    send: (event: EventFrom<typeof defaultLifecycle>) => {
      actor.send(event);
    },
    stageInput: (stage: StageName) => inputOf(child(stage)?.getSnapshot()),
    finish: (stage: StageName, outcome: unknown) => {
      child(stage)?.send({ type: "finish", outcome });
    },
    fail: (stage: StageName, reason: FailureReason) => {
      child(stage)?.send({ type: "fail", reason });
    },
    crash: (stage: StageName, message: string) => {
      child(stage)?.send({ type: "crash", message });
    },
  };
};

/** Starts a work item on the default lifecycle, with loop limits of 3, for the length of the test. */
export const startWorkItem = Effect.fnUntraced(function* () {
  const actor = yield* createWorkItem(defaultLifecycle, {
    id: "wi-1",
    issueRef: "#1",
    limits: { review: 3, reproduce: 3 },
  });
  return drive(actor);
});

/** Resumes a saved work item on the default lifecycle for the length of the test. */
export const restoredWorkItem = Effect.fnUntraced(function* (persisted: unknown) {
  return drive(yield* restoreWorkItem(defaultLifecycle, persisted));
});

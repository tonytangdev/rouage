import { Data, Effect, Schema } from "effect";
import type { Actor, EventFrom, SnapshotFrom } from "xstate";
import { createActor, waitFor } from "xstate";
import { restoreActor } from "xstate/persist";

import type { DefaultLifecycle, Lifecycle, LifecycleIdentity } from "./lifecycle-logic.ts";
import type { LoopLimits } from "./loops.ts";
import { resolveLoopLimits } from "./loops.ts";
import type { Place } from "./place.ts";
import { placeOf } from "./place.ts";
import { UnreadableSnapshot, readableSnapshot } from "./readable-snapshot.ts";
import type { TeardownGaveUp } from "./sandbox-teardown.ts";
import { teardownWhenFinal } from "./teardown-when-final.ts";
import type { WorkItemContext } from "./work-item.ts";

type WorkItemActor = Actor<Lifecycle>;

/** A running work item. The XState actor behind it stays inside this module. */
export interface WorkItem {
  /** Where the work item is now, such as `"specGate"` or `"blocked"`. */
  readonly state: () => Place;
  readonly status: () => SnapshotFrom<DefaultLifecycle>["status"];
  readonly context: () => WorkItemContext;
  /** Sends a human decision to the work item. */
  readonly send: (event: EventFrom<DefaultLifecycle>) => void;
  /** The work item's state as plain JSON, ready to store. */
  readonly save: () => ReturnType<WorkItemActor["getPersistedSnapshot"]>;
  /** Completes once the work item is at `place`; fails with `StateNotReached` if it stops first. */
  readonly reaches: (place: Place) => Effect.Effect<void, StateNotReached>;
  /** Completes once the sandbox of the work item, shipped or cancelled, is torn down. */
  readonly tornDown: Effect.Effect<void, TeardownGaveUp>;
}

export class StateNotReached extends Data.TaggedError("StateNotReached")<{
  readonly state: Place;
  readonly message: string;
}> {}

const workItemOf = (
  actor: WorkItemActor,
  tornDown: Effect.Effect<void, TeardownGaveUp>,
): WorkItem => ({
  state: () => placeOf(actor.getSnapshot().value),
  status: () => actor.getSnapshot().status,
  context: () => actor.getSnapshot().context,
  send: (event) => {
    actor.send(event);
  },
  save: () => actor.getPersistedSnapshot(),
  reaches: (place) =>
    Effect.tryPromise({
      try: () => waitFor(actor, (snapshot) => placeOf(snapshot.value) === place),
      catch: (error) => new StateNotReached({ state: place, message: String(error) }),
    }).pipe(Effect.asVoid),
  tornDown,
});

const PersistedEnvelope = Schema.Struct({
  machine: Schema.Struct({ id: Schema.String, version: Schema.String }),
});

export class LifecycleVersionMismatch extends Data.TaggedError("LifecycleVersionMismatch")<{
  readonly expected: LifecycleIdentity;
  readonly found: LifecycleIdentity;
}> {}

export interface NewWorkItem {
  readonly id: string;
  readonly issueRef: string;
  readonly limits?: Partial<LoopLimits>;
}

const isDone = (snapshot: SnapshotFrom<DefaultLifecycle>) => snapshot.status === "done";

// A defect, not a failure, when the actor stops first, because the scope that
// stops it interrupts this wait before it does.
const final = (actor: WorkItemActor) =>
  Effect.promise(() => waitFor(actor, isDone)).pipe(Effect.asVoid);

const runScoped = (start: () => WorkItemActor) =>
  Effect.acquireRelease(Effect.sync(start), (actor) => Effect.sync(() => actor.stop()));

const withTeardown = Effect.fnUntraced(function* (actor: WorkItemActor) {
  const { tornDown } = yield* teardownWhenFinal(actor.getSnapshot().context.id, final(actor), () =>
    isDone(actor.getSnapshot()),
  );
  return workItemOf(actor, tornDown);
});

/**
 * Starts a work item on `lifecycle`, resolving its loop limits once now. The
 * actor stops when the enclosing scope closes.
 */
export const createWorkItem = Effect.fnUntraced(function* (
  lifecycle: Lifecycle,
  item: NewWorkItem,
) {
  const limits = yield* resolveLoopLimits(item.limits);
  const actor = yield* runScoped(() =>
    createActor(lifecycle, { input: { id: item.id, issueRef: item.issueRef, limits } }).start(),
  );
  return yield* withTeardown(actor);
});

const unreadable = (message: string) => new UnreadableSnapshot({ message });

/**
 * Resumes a saved work item. Fails with `LifecycleVersionMismatch` when it was
 * saved under another lifecycle id or version, because restoring it anyway
 * could silently put it in the wrong state.
 */
export const restoreWorkItem = Effect.fnUntraced(function* (
  lifecycle: Lifecycle,
  persisted: unknown,
) {
  const expected = { id: lifecycle.id, version: lifecycle.version };
  const { machine: found } = yield* Schema.decodeUnknownEffect(PersistedEnvelope)(persisted).pipe(
    Effect.mapError((error) => unreadable(error.message)),
  );
  if (found.id !== expected.id || found.version !== expected.version) {
    return yield* new LifecycleVersionMismatch({ expected, found });
  }
  const snapshot = yield* readableSnapshot(lifecycle, persisted);
  const actor = yield* runScoped(() => restoreActor(lifecycle, snapshot).start());
  const restored = actor.getSnapshot();
  if (restored.status === "error") {
    return yield* unreadable(String(restored.error));
  }
  return yield* withTeardown(actor);
});

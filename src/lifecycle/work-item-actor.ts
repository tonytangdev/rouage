import { Data, Effect, Schema } from "effect";
import type {
  Actor,
  ActorLogic,
  AnyActorSystem,
  EmittedFrom,
  EventFrom,
  SnapshotFrom,
} from "xstate";
import { createActor, waitFor } from "xstate";
import { restoreActor, snapshotSchema } from "xstate/persist";

import { defaultLifecycle } from "./lifecycle.ts";
import type { LoopLimits } from "./loops.ts";
import { resolveLoopLimits } from "./loops.ts";
import type { Place } from "./place.ts";
import { placeOf } from "./place.ts";
import type { TeardownGaveUp } from "./sandbox-teardown.ts";
import { teardownWhenFinal } from "./teardown-when-final.ts";
import type { WorkItemContext, WorkItemInput } from "./work-item.ts";

type DefaultLifecycle = typeof defaultLifecycle;

interface LifecycleIdentity {
  readonly id: string;
  readonly version: string;
}

/**
 * The default lifecycle with any stage implementations provided, identified by
 * its own id and version. Providing stages gives each set of stages its own
 * machine type, so a work item accepts any logic with the default lifecycle's
 * snapshot, events and input. Rouage bumps the default lifecycle's version
 * whenever a saved work item could no longer restore as it did; a custom
 * lifecycle owns its id and version, and keeps the same rule (ADR 0002).
 */
export type Lifecycle = ActorLogic<
  SnapshotFrom<DefaultLifecycle>,
  EventFrom<DefaultLifecycle>,
  WorkItemInput,
  AnyActorSystem,
  EmittedFrom<DefaultLifecycle>
> &
  LifecycleIdentity;
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

export class UnreadableSnapshot extends Data.TaggedError("UnreadableSnapshot")<{
  readonly message: string;
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

// Decoded with the default lifecycle's schema because `Lifecycle` shares its
// snapshot type; restoring then rejects any state the given lifecycle lacks.
const validateSnapshot = Effect.fnUntraced(function* (persisted: unknown) {
  const result = yield* Effect.tryPromise({
    try: () => Promise.resolve(snapshotSchema(defaultLifecycle)["~standard"].validate(persisted)),
    catch: (error) => unreadable(String(error)),
  });
  if (result.issues !== undefined) {
    return yield* unreadable(result.issues.map((issue) => issue.message).join("; "));
  }
  return result.value;
});

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
  const snapshot = yield* validateSnapshot(persisted);
  const actor = yield* runScoped(() => restoreActor(lifecycle, snapshot).start());
  const restored = actor.getSnapshot();
  if (restored.status === "error") {
    return yield* unreadable(String(restored.error));
  }
  return yield* withTeardown(actor);
});

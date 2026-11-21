import { Data, Effect } from "effect";
import type { Actor, EventFrom, SnapshotFrom } from "xstate";
import { createActor, waitFor } from "xstate";
import { restoreActor } from "xstate/persist";

import type { DefaultLifecycle, Lifecycle } from "./lifecycle-logic.ts";
import type { LifecycleMigration } from "./lifecycle-migration.ts";
import { defaultLifecycleMigrations, migratedToCurrent } from "./lifecycle-migration.ts";
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
 * Resumes a saved work item, first moving it to `lifecycle`'s version through
 * `migrations` when it was saved under an older one, failing as
 * `migratedToCurrent` does when it was saved under another lifecycle id or a
 * version no migration leads on from (ADR 0015). Fails with
 * `UnreadableSnapshot` when what it then holds does not fit `lifecycle`
 * (ADR 0002, ADR 0014).
 */
export const restoreWorkItem = Effect.fnUntraced(function* (
  lifecycle: Lifecycle,
  persisted: unknown,
  migrations: readonly LifecycleMigration[] = defaultLifecycleMigrations,
) {
  const current = yield* migratedToCurrent(lifecycle, persisted, migrations);
  const snapshot = yield* readableSnapshot(lifecycle, current);
  const actor = yield* runScoped(() => restoreActor(lifecycle, snapshot).start());
  const restored = actor.getSnapshot();
  if (restored.status === "error") {
    return yield* unreadable(String(restored.error));
  }
  return yield* withTeardown(actor);
});

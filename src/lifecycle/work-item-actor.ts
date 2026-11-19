import { Data, Effect, Schema } from "effect";
import type { Actor, EventFrom, SnapshotFrom } from "xstate";
import { createActor } from "xstate";
import { restoreActor, snapshotSchema } from "xstate/persist";

import type { defaultLifecycle } from "./lifecycle.ts";
import type { LoopLimits } from "./loops.ts";
import { resolveLoopLimits } from "./loops.ts";
import { innermostState } from "./state-value.ts";
import type { WorkItemContext } from "./work-item.ts";

export type Lifecycle = typeof defaultLifecycle;
type WorkItemActor = Actor<Lifecycle>;

/** A running work item. The XState actor behind it stays inside this module. */
export interface WorkItem {
  /** The innermost active state, such as `"specGate"` or `"blocked"`. */
  readonly state: () => string;
  readonly status: () => SnapshotFrom<Lifecycle>["status"];
  readonly context: () => WorkItemContext;
  /** Sends a human decision to the work item. */
  readonly send: (event: EventFrom<Lifecycle>) => void;
  /** The work item's state as plain JSON, ready to store. */
  readonly save: () => ReturnType<WorkItemActor["getPersistedSnapshot"]>;
}

const workItemOf = (actor: WorkItemActor): WorkItem => ({
  state: () => innermostState(actor.getSnapshot().value),
  status: () => actor.getSnapshot().status,
  context: () => actor.getSnapshot().context,
  send: (event) => {
    actor.send(event);
  },
  save: () => actor.getPersistedSnapshot(),
});

const PersistedEnvelope = Schema.Struct({
  machine: Schema.Struct({ id: Schema.String, version: Schema.String }),
});

interface LifecycleIdentity {
  readonly id: string;
  readonly version: string;
}

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

const runScoped = (start: () => WorkItemActor) =>
  Effect.acquireRelease(Effect.sync(start), (actor) => Effect.sync(() => actor.stop()));

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
  return workItemOf(actor);
});

const unreadable = (message: string) => new UnreadableSnapshot({ message });

const validateSnapshot = Effect.fnUntraced(function* (lifecycle: Lifecycle, persisted: unknown) {
  const result = yield* Effect.tryPromise({
    try: () => Promise.resolve(snapshotSchema(lifecycle)["~standard"].validate(persisted)),
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
  const snapshot = yield* validateSnapshot(lifecycle, persisted);
  const actor = yield* runScoped(() => restoreActor(lifecycle, snapshot).start());
  const restored = actor.getSnapshot();
  if (restored.status === "error") {
    return yield* unreadable(String(restored.error));
  }
  return workItemOf(actor);
});

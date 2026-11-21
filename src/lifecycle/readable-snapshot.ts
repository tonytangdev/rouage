import { Data, Effect, Schema } from "effect";
import type { StandardSchemaV1 } from "xstate";
import { StateMachine } from "xstate";
import { snapshotSchema } from "xstate/persist";

import type { LifecycleSources } from "./lifecycle-logic.ts";
import { defaultLifecycle } from "./lifecycle.ts";
import { taskSchemaOf } from "./step-task.ts";

export class UnreadableSnapshot extends Data.TaggedError("UnreadableSnapshot")<{
  readonly message: string;
}> {}

export const unreadable = (message: string) => new UnreadableSnapshot({ message });

const validated = Effect.fnUntraced(function* <Output>(
  schema: StandardSchemaV1<unknown, Output>,
  value: unknown,
  what: string,
) {
  const result = yield* Effect.tryPromise({
    try: () => Promise.resolve(schema["~standard"].validate(value)),
    catch: (error) => unreadable(`${what}: ${String(error)}`),
  });
  if (result.issues !== undefined) {
    return yield* unreadable(`${what}: ${result.issues.map((issue) => issue.message).join("; ")}`);
  }
  return result.value;
});

const SavedChildren = Schema.Struct({
  children: Schema.Record(
    Schema.String,
    Schema.Struct({
      src: Schema.optional(Schema.String),
      snapshot: Schema.optional(Schema.Unknown),
    }),
  ),
});

const SavedStep = Schema.Struct({
  status: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Unknown),
});

const savedChildren = Effect.fnUntraced(function* (logic: LifecycleSources, persisted: unknown) {
  const { children } = yield* Schema.decodeUnknownEffect(SavedChildren)(persisted).pipe(
    Effect.mapError((error) => unreadable(error.message)),
  );
  return Object.entries(children).flatMap(([id, { src, snapshot }]) => {
    const source = src === undefined ? undefined : logic.sources.actors[src];
    return source === undefined || snapshot === undefined ? [] : [{ id, source, snapshot }];
  });
});

// A finished step drops its input, so only a running one is checked.
const checkSavedSteps = Effect.fnUntraced(function* (
  stage: string,
  machine: LifecycleSources,
  persisted: unknown,
) {
  for (const { id, source, snapshot } of yield* savedChildren(machine, persisted)) {
    const task = taskSchemaOf(source);
    const { status, input } = yield* Schema.decodeUnknownEffect(SavedStep)(snapshot).pipe(
      Effect.mapError((error) => unreadable(error.message)),
    );
    if (task !== undefined && status === "active") {
      yield* validated(task, input, `The task of the saved ${stage} stage's ${id} step`);
    }
  }
});

// XState checks neither a child's context against its machine's context
// schema when it validates the parent snapshot, nor when it restores it, so
// each running stage machine is checked against its own snapshot schema.
// Stage logic that is not a machine goes unchecked, because XState gives a
// snapshot schema only for machines (ADR 0014).
const checkSavedStages = Effect.fnUntraced(function* (
  lifecycle: LifecycleSources,
  persisted: unknown,
) {
  for (const { id, source, snapshot } of yield* savedChildren(lifecycle, persisted)) {
    if (source instanceof StateMachine) {
      yield* validated(snapshotSchema(source), snapshot, `The saved ${id} stage`);
      yield* checkSavedSteps(id, source, snapshot);
    }
  }
});

/**
 * The saved work item `persisted`, once its lifecycle context, its states,
 * the saved snapshot of each running stage machine and the task of each step
 * running in one fit what `lifecycle` runs now; fails with `UnreadableSnapshot`
 * naming what does not (ADR 0002, ADR 0014, ADR 0016).
 */
export const readableSnapshot = Effect.fnUntraced(function* (
  lifecycle: LifecycleSources,
  persisted: unknown,
) {
  // Decoded with the default lifecycle's schema because every lifecycle shares
  // its snapshot type; restoring then rejects any state the given one lacks.
  const snapshot = yield* validated(
    snapshotSchema(defaultLifecycle),
    persisted,
    "The saved work item",
  );
  yield* checkSavedStages(lifecycle, persisted);
  return snapshot;
});

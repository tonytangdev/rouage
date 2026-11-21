import { Data, Effect, Schema } from "effect";
import type { StandardSchemaV1 } from "xstate";
import { StateMachine } from "xstate";
import { snapshotSchema } from "xstate/persist";

import type { LifecycleSources } from "./lifecycle-logic.ts";
import { defaultLifecycle } from "./lifecycle.ts";

export class UnreadableSnapshot extends Data.TaggedError("UnreadableSnapshot")<{
  readonly message: string;
}> {}

const unreadable = (message: string) => new UnreadableSnapshot({ message });

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

const SavedStages = Schema.Struct({
  children: Schema.Record(
    Schema.String,
    Schema.Struct({
      src: Schema.optional(Schema.String),
      snapshot: Schema.optional(Schema.Unknown),
    }),
  ),
});

// XState checks neither a child's context against its machine's context
// schema when it validates the parent snapshot, nor when it restores it, so
// each running stage machine is checked against its own snapshot schema.
// Stage logic that is not a machine keeps its saved state to itself.
const checkSavedStages = Effect.fnUntraced(function* (
  lifecycle: LifecycleSources,
  persisted: unknown,
) {
  const { children } = yield* Schema.decodeUnknownEffect(SavedStages)(persisted).pipe(
    Effect.mapError((error) => unreadable(error.message)),
  );
  for (const [stage, { src, snapshot }] of Object.entries(children)) {
    const logic = src === undefined ? undefined : lifecycle.sources.actors[src];
    if (logic instanceof StateMachine && snapshot !== undefined) {
      yield* validated(snapshotSchema(logic), snapshot, `The saved ${stage} stage`);
    }
  }
});

/**
 * The saved work item `persisted`, once its lifecycle context, its states and
 * the saved context of each running stage machine fit what `lifecycle` runs
 * now; fails with `UnreadableSnapshot` naming what does not (ADR 0002, ADR 0014).
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

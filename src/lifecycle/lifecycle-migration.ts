import { Data, Effect, Schema } from "effect";

import type { LifecycleIdentity } from "./lifecycle-logic.ts";
import { UnreadableSnapshot } from "./readable-snapshot.ts";

/** A saved work item as plain JSON, as a work item saves it and a store gives it back. */
export const SavedWorkItemSchema = Schema.Record(Schema.String, Schema.Unknown);
export type SavedWorkItem = typeof SavedWorkItemSchema.Type;

/**
 * One step between two versions of a lifecycle: `migrate` is given a work
 * item saved under `from` and returns it as the lifecycle's version `to`
 * would have saved it. Rouage stamps the result with `to`, so `migrate`
 * leaves the `machine` field alone; it must be pure, because a failed
 * restore may run it again (ADR 0015).
 */
export interface LifecycleMigration {
  readonly from: LifecycleIdentity;
  readonly to: string;
  readonly migrate: (saved: SavedWorkItem) => SavedWorkItem;
}

/** The migrations of the default lifecycle, one per version bump since the first release (ADR 0002). */
export const defaultLifecycleMigrations: readonly LifecycleMigration[] = [];

export class LifecycleVersionMismatch extends Data.TaggedError("LifecycleVersionMismatch")<{
  readonly expected: LifecycleIdentity;
  readonly found: LifecycleIdentity;
}> {}

const PersistedEnvelope = Schema.Struct({
  machine: Schema.Struct({ id: Schema.String, version: Schema.String }),
});

const unreadable = (message: string) => new UnreadableSnapshot({ message });

const sameIdentity = (a: LifecycleIdentity, b: LifecycleIdentity) =>
  a.id === b.id && a.version === b.version;

interface Chain {
  readonly expected: LifecycleIdentity;
  readonly found: LifecycleIdentity;
}

const migrateFrom = Effect.fnUntraced(function* (
  chain: Chain,
  saved: SavedWorkItem,
  current: LifecycleIdentity,
  unused: readonly LifecycleMigration[],
): Effect.fn.Return<SavedWorkItem, LifecycleVersionMismatch | UnreadableSnapshot> {
  if (sameIdentity(current, chain.expected)) {
    return saved;
  }
  const next = unused.find((migration) => sameIdentity(migration.from, current));
  if (next === undefined) {
    return yield* new LifecycleVersionMismatch(chain);
  }
  const migrated = yield* Effect.try({
    try: () => next.migrate(saved),
    catch: (error) =>
      unreadable(`The migration from version ${current.version} to ${next.to}: ${String(error)}`),
  });
  const reached = { id: current.id, version: next.to };
  return yield* migrateFrom(
    chain,
    { ...migrated, machine: reached },
    reached,
    unused.filter((migration) => migration !== next),
  );
});

/**
 * `persisted` as `lifecycle`'s current version saves it: as is when it was
 * saved under that version, else after each migration from the version it
 * reached so far, one step at a time, using each migration once. Fails with
 * `LifecycleVersionMismatch` when no migration leads on to the current
 * version, because restoring the work item anyway could silently put it in the
 * wrong state, and with `UnreadableSnapshot` when it is not a saved work item
 * or a migration throws. What a migration returns is checked only once
 * restored (ADR 0015).
 */
export const migratedToCurrent = Effect.fnUntraced(function* (
  lifecycle: LifecycleIdentity,
  persisted: unknown,
  migrations: readonly LifecycleMigration[],
) {
  const saved = yield* Schema.decodeUnknownEffect(SavedWorkItemSchema)(persisted).pipe(
    Effect.mapError((error) => unreadable(error.message)),
  );
  const { machine: found } = yield* Schema.decodeUnknownEffect(PersistedEnvelope)(saved).pipe(
    Effect.mapError((error) => unreadable(error.message)),
  );
  const expected = { id: lifecycle.id, version: lifecycle.version };
  return yield* migrateFrom({ expected, found }, saved, found, migrations);
});

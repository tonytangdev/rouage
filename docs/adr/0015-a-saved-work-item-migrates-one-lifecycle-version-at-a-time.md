# A saved work item migrates one lifecycle version at a time

From the first release on, every change that could make a saved work item restore wrongly bumps the lifecycle version (ADR 0002), and `restoreWorkItem` refuses a work item saved under another version, so each bump would strand every work item in flight (#38).

A `LifecycleMigration` moves a saved work item one step: from one version of a lifecycle, named by its id and version, to the next version of the same lifecycle. `restoreWorkItem` takes the migrations it may use, the default lifecycle's `defaultLifecycleMigrations` unless given others, and before anything else applies the migration from the version the work item was saved under, then the one from the version that reached, until it reaches the lifecycle's current version. Rouage stamps each result with the version it reached, and uses each migration at most once, so migrations that lead back refuse the work item instead of looping. A work item no migration leads on from fails with `LifecycleVersionMismatch` naming the version it was saved under. A migration is a pure function from saved JSON to saved JSON, run before `restoreActor`; what the last one returns then goes through the same checks as any saved work item, the context Schema, the states and each running stage machine (ADR 0014), so a migration that leaves the work item unfit fails with `UnreadableSnapshot`, as does one that throws.

The saved-shape pin of each released version stays in `src/lifecycle/` (ADR 0002). It documents what the migration from that version is given; the migration's test builds a work item of that shape by hand, as `lifecycle-migration.test.ts` does, and restores it on the current lifecycle, which checks the result against the current shape. No test reads an old pin's contents, because a pin holds a JSON Schema and Rouage has no JSON Schema validator. A test also fails while any version pinned before the current one has no migration from it, for the default lifecycle's id, in `defaultLifecycleMigrations`.

## Considered Options

- **Migrate straight to the current version, as XState's `machineVersions` does.** Rejected: each version would need its own migration to every later version, or the schema of every old version kept as code. One step per bump is written once, against the two shapes its author knows.
- **XState's `machineVersions` for the steps.** Rejected for now: it needs the actual machine for its target and a full snapshot schema for each old version, while a pin holds only the context and the state ids. A step may still use it inside its own `migrate`.
- **Migrations declared on the lifecycle.** Rejected: providing stages makes a new machine, which would drop anything Rouage added to it, so the migrations travel with the restore instead.

## Consequences

- A version bump after the first release comes with its migration in `defaultLifecycleMigrations`, and its old pin is kept.
- A custom lifecycle passes its own migrations to `restoreWorkItem`; the default lifecycle's never apply to it, because each migration names the lifecycle id it is from.
- A migration cannot change what a running stage machine holds without knowing that stage's saved shape; a stage machine whose context changed is refused when restored (ADR 0014).

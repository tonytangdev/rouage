# A restored stage machine is checked against its own snapshot schema

Restoring a work item checks the lifecycle's context against `WorkItemContextSchema` (ADR 0002), but a stage machine running when the work item was saved has a context of its own, saved inside the lifecycle's snapshot. XState checks that context against nothing: validating the lifecycle's snapshot does not look into its children's contexts, and restoring a child does not check its context against its machine's context schema. A work item saved mid-stage before the stage's context changed therefore restored silently with a context that no longer fit (#39).

`restoreWorkItem` now looks up the logic of each stage running in the saved snapshot by its source name in the lifecycle it restores on, and, when that logic is a state machine, validates the saved stage snapshot against `snapshotSchema` of that machine, which checks its states, its children and its context against its context schema. A stage snapshot that does not fit fails the restore with `UnreadableSnapshot` naming the stage, before any stage step runs again. Stage logic that is not a state machine, such as the test stubs, keeps its saved state to itself and is not checked.

For the check to mean anything a stage machine must declare its context as a runtime Schema rather than a TypeScript type, so the stage input is now `StageInputSchema`, an Effect Schema built from the work item's facts, and Rouage's stage machines declare their context with it, or, for Build, with a Schema that holds it.

## Considered Options

- **Pin each stage's saved shape next to the lifecycle's (ADR 0002) instead.** Rejected as a replacement: a provided stage is not Rouage's to pin, and the restore check covers every stage machine, provided or not. Rouage's own stage machines are now pinned as well, built on their fake ports (ADR 0016).
- **Check only the stage input held in the stage's context.** Rejected: a stage keeps more than its input, such as Build's fix attempts, and the stage machine's own schema already describes all of it.

## Consequences

- A stage machine that keeps its context in a TypeScript type only is restored unchecked; a provided stage machine declares a context Schema to be checked.
- A port step running inside a stage restores with the task it was saved with, which is checked against the task's Schema (ADR 0016).
- A change to a Rouage stage machine's context is caught by `pnpm check` too, through the pin of its saved shape (ADR 0016).

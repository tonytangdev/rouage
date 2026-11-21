# A stage machine's state input is checked on restore and pinned

A stage machine's states may hold state input, such as Reproduce's `capturing` (the sandbox) or Build's `fixing` (the failures to fix), and XState saves the input of each active state in the stage's snapshot as `stateInputs`. Rouage's stage machines declared that input with `types<T>()`, a TypeScript type only, and XState's `snapshotSchema` checks a machine's context but not its state inputs. A change to one of those shapes therefore passed `pnpm check` and restored a saved work item silently (#46).

Each state input of Rouage's stage machines is now an Effect Schema, and so is each stage's outcome, which a final state holds as its input: `StageOutcomeSchemas` replaces the `StageOutcomes` type, and `OutcomeOf` is read from it. Restoring a work item checks the saved input of each active state of a running stage machine against the input schema that state declares, failing with `UnreadableSnapshot` naming the stage and state before any step runs. A state declaring no input schema, or a state no longer in the machine, is not checked; XState drops the input of a state it does not restore. `stageSavedShape` gives, by state id, the JSON Schema of each declared state input, so Rouage's pin of its stage machines holds them (ADR 0016).

## Considered Options

- **Rely on XState's restore.** Rejected: neither `snapshotSchema` nor `restoreActor` checks a saved state input against its state's input schema; restoring only drops the inputs of states that are not active.
- **Leave final states' input unpinned.** Rejected: whether a finished stage's snapshot is ever saved depends on when the lifecycle reacts to it, which the pin should not assume; a Schema for each outcome costs no more than the type did.

## Consequences

- A change to a state input or a stage outcome, such as a new field in Build's failures, fails `pnpm check` until the pin is updated or, once Rouage is published, the lifecycle version is bumped (ADR 0002, ADR 0015).
- A provided stage machine has its state inputs checked on restore when it declares them with a runtime Standard Schema; a type-only `types<T>()` input passes any value.
- The machine's own input is not a state input: the root state node shares the machine's `schemas`, so it is left out of both the check and the pin.

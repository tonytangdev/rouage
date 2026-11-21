# The lifecycle is two levels of persisted machines; machines decide, Effect does

A work item lives for days and waits on humans at gates, so the process will restart while it is in flight. The lifecycle is therefore modelled as XState machines whose state is saved after every transition and restored on start, and whose context holds only plain JSON data: identifiers, counters, decisions, and references to evidence or sandboxes, never live handles.

There are exactly two levels of machines:

- The **lifecycle** machine holds the stages and the moves between them, including gates, Blocked and Cancelled.
- Each **stage** is a separate **stage machine**, invoked as a child actor while its stage state is active. It receives an input (the work item data it needs) and finishes with an **outcome**, a tagged value such as `reproduced`, `needsSample` or `changesRequested`. The lifecycle maps each outcome to the next transition; a stage never names the stage after it. A stage that cannot finish does not return an outcome: it fails with a `StageFailure` carrying the reason, the way an Effect program fails, and the lifecycle handles every stage's error once, on the state that holds the stages, by blocking the work item. Any other error from a stage counts as a crash and blocks it the same way.

Below the stage machines, work is Effect programs, not machines. Machines never perform side effects: a state declares what must run, the runtime runs it as an Effect program through the plugin services, and the result comes back to the machine as an event. Retries, timeouts and sandbox cleanup are Effect's job.

Each persisted snapshot carries the lifecycle machine's `id` and `version`. Restoring a snapshot under a different version fails with a tagged `LifecycleVersionMismatch` error instead of guessing.

The version is an opaque counter, independent of the package version. From the first release on, meaning the first npm publish, it is bumped by every change that could make a saved work item restore wrongly or not at all: a change to the context Schema, to the state tree, or to what a value means under an unchanged shape. Until then it stays `"1"`, because no released work item exists to strand. Rouage keeps this rule for the default lifecycle; a custom lifecycle, and a provided stage machine, own their id and version. A test pins the default lifecycle's saved shape, the JSON Schema of its context and every state id, to `src/lifecycle/saved-shape.v<version>.json`, so a change to either fails `pnpm check` until the version is bumped and a new pin written; a change of meaning under an unchanged shape stays a written rule (#29).

## Considered Options

- **One machine with every stage's internal states nested in it.** Simpler to start, but a stage cannot be replaced without editing the lifecycle, and "every part is replaceable" is a core principle.
- **Machines nested to any depth.** Flexible, but much harder to reason about, test and persist. When a stage needs more structure, it gets nested states inside its own stage machine, not a third level of machines.
- **A `failed` outcome per stage, routed by each stage's transition.** Rejected: every stage then repeated the same move to Blocked, which buried each stage's real outcomes in the diagram.
- **A Rouage-specific declarative lifecycle format compiled to XState.** Rejected for now: it is a second language to design, document and version before we know what users need. The lifecycle is plain XState built with Rouage's helpers, and stages are swapped by name with `provide`.

## Consequences

- A stage implementation is anything that accepts the stage input and finishes with that stage's outcome type. The lifecycle declares each stage as a `StageLogic` slot (`src/lifecycle/stage-slot.ts`) typed by its input and outcome alone, so `provide` accepts a stage machine with any context of its own; see #3.
- Lifecycle tests drive the machine with events alone; no plugin, sandbox or agent is needed.
- Values that must not change mid-flight, such as loop limits read from configuration, are resolved by Effect when the work item is created and stored in its context.
- Transitions read no clock: events that record a decision carry their own timestamp.
- Every transition names its target as a literal, and helpers return only context changes, because Stately's editor cannot draw a target that a helper computes. Retrying a blocked work item targets a history state of the working stages rather than a target computed from context, for the same reason.
- The work item's context is declared as an Effect Schema and given to XState as its context schema, so restoring a snapshot whose context does not match it, such as one saved before a fact existed, fails with a tagged `UnreadableSnapshot` error.
- Migrating snapshots between lifecycle versions is not supported yet; a version change strands in-flight work items until a migration exists.

# A folder per stage, owning its port; stages depend on the lifecycle, never the reverse

Each stage implementation of the default lifecycle lives in its own folder under `src/stages/<stage>/`. That folder holds:

- the stage machine,
- the **port** it runs its steps through (such as Builder or Classifier),
- the port's fake,
- the stage's test harness and its tests.

What every port stage shares sits at the root of `src/stages/`: the step helper that turns a port giving up into a `StageFailure`, the machine for a stage that asks its port one thing, the scripted-port workings behind every fake, the runner for testing a stage alone, and the contract every port stage passes inside the lifecycle (it blocks when its port gives up, and runs its first step again after a restore). A shape that only some stages share, such as the built change Demo and Review are both given, sits there too, so no stage folder imports another.

A port belongs to its stage, because it is the interface that one stage needs from the outside world, written in that stage's terms (see "Port" in `GLOSSARY.md`). A plugin fills ports; it does not define them. A port's answers are its own types, never the lifecycle's outcomes, and its stage maps each answer to an outcome, so a change to the lifecycle's outcomes never changes a plugin contract. The one port the lifecycle owns, sandbox teardown, belongs to no stage ([ADR 0007](0007-the-lifecycle-tears-down-a-sandbox-at-least-once-through-a-port-it-owns.md)).

Dependencies run one way. Stages import the lifecycle's stage contract (`StageInput`, `Kind`, `StageFailure`, the stage contract suite). The lifecycle, including its test support, never imports a stage. This is why the lifecycle harness types the real stages it runs as any state machine, and why each stage folder runs the stage contract suite against itself.

## Considered Options

- **Ports in `src/plugins/`, stage machines in `src/lifecycle/`.** This was the first layout. It was rejected because one stage was spread across six files in two folders, and the two folders imported each other: the stages imported their ports, and a port imported `Kind` from the lifecycle.
- **Type the lifecycle harness's real stages from each stage factory.** This gave a compile-time check that a stage fits its slot. It was rejected because the lifecycle then depended on every stage. The stage contract suite and each stage's lifecycle tests catch a stage that does not fit its slot when the tests run.

## Consequences

- Adding a stage implementation means adding one folder. `src/lifecycle/` changes only when the stage's outcome does, or when the outcome brings a new fact for the work item to keep. A new outcome is one entry in the table of what each outcome teaches (`src/lifecycle/outcome-teaching.ts`), which says the references it sets, its feedback, change request and demo change, and whether it loops or blocks; the lifecycle only routes it to a literal target. A reference is one field in `src/lifecycle/facts.ts` and the entries that set it; a fact with a lifetime of its own is one `StandingFact` declaration, listed in `src/lifecycle/facts.ts`. A new kind of transition is one variant in `src/lifecycle/transition.ts` and its case in `workItemAfter`, which must handle every kind; a standing fact matches only the transitions that change it and keeps its value through the rest, so it is edited only when the new kind changes it. See #40.
- `src/plugins/` is reserved for real adapters that fill ports, such as a Claude Code plugin. It does not exist until the first one does.

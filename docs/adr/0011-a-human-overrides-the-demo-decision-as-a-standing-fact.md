# A human overrides the demo decision as a standing fact

A human overrides Plan's decision on whether a **demo** is worth it by sending `requireDemo` or `skipDemo`, accepted anywhere the work item is not shipped or cancelled and recorded as a `Decision` (#22). The latest override is kept as its own fact, `demoOverride`, which a later Plan outcome does not overwrite, because a plan re-run after a retry would otherwise silently undo the human's choice. Build routes on `demoOverride ?? demoPlanned` each time it finishes, and Review sees a demo only when that choice calls for one. `backToSpec` resets the override, because a new spec leads to a new plan whose demo decision the human has not yet seen; a Review loop, a ship gate rejection and a retry keep it.

An override moves the work item only where waiting would waste or repeat the demo the human just skipped: `skipDemo` while Demo runs stops it and moves to Review, and a retry from a block at Demo goes to Review when no demo is called for. Everywhere else it takes effect the next time Build finishes, so `requireDemo` at the ship gate needs a rejection to reach Demo. An override's comment is recorded but is not **Feedback**, so it never displaces what the next stage must address.

## Considered Options

- **A plan gate.** A human would approve every plan, so every work item would wait on a human at Plan for a decision that is usually right.
- **A `WorkItemInput` setting.** Decided before any plan exists, so the human chooses without the plan's reasoning, and cannot change it later.
- **One `overrideDemo` action with a `demo` field on every `Decision`.** Two actions keep the `Decision` shape flat and each record self-describing.
- **`requireDemo` at the ship gate jumps to Demo.** Adds an arrow from a gate to a stage it does not return to, for a case a rejection already covers.

## Consequences

- A lifecycle that a user extends or replaces must route on the override wherever it routes on the plan's demo decision.

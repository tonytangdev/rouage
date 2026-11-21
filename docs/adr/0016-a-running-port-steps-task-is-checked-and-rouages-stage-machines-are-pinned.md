# A running port step's task is checked on restore, and Rouage's stage machines' saved shapes are pinned

A port step running inside a stage when its work item is saved keeps its task as the step's saved input, and runs again with that task when the work item is restored. The restore check of ADR 0014 covered the stage machine's context, states and child sources but not that task, so a task whose shape had changed since, such as `BuildTask`, reached the port silently (#44). A change to a Rouage stage machine's context or states, or to a task, was also caught only when a saved work item was restored, not by `pnpm check` the way the lifecycle's saved shape is (#43).

Each port step now declares its task as an Effect Schema: `PortStep` takes the task's Schema before the call, and a `SingleStep` names its `taskSchema`. The step's logic is recorded against that Schema with `withTaskSchema` (`src/lifecycle/step-task.ts`), and restoring a work item checks the saved input of each step running in a running stage machine against the Schema its logic was recorded with, failing with `UnreadableSnapshot` naming the stage and step before any step runs. Logic recorded with no Schema, or a step that is not running, is not checked. A provided stage machine can record its own step logic the same way.

Because a task is now part of what a saved work item depends on, it belongs to the saved shape. `stageSavedShape` gives a stage machine's saved shape: the JSON Schema of its context, every state id, and the JSON Schema of each step's task by source name. `src/stages/saved-shape.test.ts` builds each of Rouage's stage machines on its fake port and pins their shapes to `src/stages/saved-shape.v<version>.json`, under the default lifecycle's version. Rouage's stage machines have no version of their own: they are saved inside a default lifecycle's work item, so a change to one bumps the lifecycle version and is migrated with it (ADR 0002, ADR 0015).

## Considered Options

- **XState's own input schema on async logic.** Rejected: `createAsyncLogic` accepts `schemas.input` for its types only. XState does not keep it on the logic, and checks a child's input neither when it validates a parent snapshot nor when it restores the child.
- **A Schema property set on the logic object.** Rejected: reading it back needs a guard that a value is a Standard Schema, which neither Effect nor XState provides. A `WeakMap` from logic to Schema gives the type without one, and still finds the logic after `setup` or `provide`, which keep the same logic object.
- **One pin holding both the lifecycle's and the stages' shapes.** Rejected: the lifecycle code would then depend on the stages, which depend on it. The two pins share their version and file name, and a bump writes both.
- **A version per stage machine.** Rejected: a work item records only its lifecycle's version, so a stage version would need a second migration chain for Rouage's own stages.

## Consequences

- A change to a task, such as a new field in `BuildTask`, fails `pnpm check` until the pin is updated or, once Rouage is published, the lifecycle version is bumped.
- A provided stage machine is not pinned; its author owns its shape (ADR 0002).
- The input of a stage machine's own states is saved too; it is checked on restore and pinned as well (ADR 0017).

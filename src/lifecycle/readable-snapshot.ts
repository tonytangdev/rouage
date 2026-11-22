import type { Schema } from "effect";
import { Data, Effect } from "effect";
import type { AnyStateMachine, StandardSchemaV1 } from "xstate";
import { StateMachine } from "xstate";
import { snapshotSchema } from "xstate/persist";

import type { LifecycleSources } from "./lifecycle-logic.ts";
import { defaultLifecycle } from "./lifecycle.ts";
import { savedStagesOf, savedStateInputsOf, savedStepsOf } from "./saved-work-item.ts";
import { stateInputSchemasOf } from "./state-nodes.ts";
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

const readable = <A, R>(effect: Effect.Effect<A, Schema.SchemaError, R>) =>
  effect.pipe(Effect.mapError((error) => unreadable(error.message)));

const checkSavedSteps = Effect.fnUntraced(function* (
  stage: string,
  machine: AnyStateMachine,
  snapshot: unknown,
) {
  for (const { id, src, task } of yield* readable(savedStepsOf(snapshot))) {
    const source = machine.sources.actors[src];
    const schema = source === undefined ? undefined : taskSchemaOf(source);
    if (schema !== undefined) {
      yield* validated(schema, task, `The task of the saved ${stage} stage's ${id} step`);
    }
  }
});

// XState's snapshotSchema checks a machine's context but not its state
// inputs, so each saved input is checked against its state's input schema.
// XState saves inputs of active states only, and drops on restore the input
// of a state the machine no longer has, so such an input goes unchecked.
const checkSavedStateInputs = Effect.fnUntraced(function* (
  stage: string,
  machine: AnyStateMachine,
  snapshot: unknown,
) {
  const stateInputs = yield* readable(savedStateInputsOf(snapshot));
  const declared = stateInputSchemasOf(machine.root);
  for (const [id, input] of Object.entries(stateInputs)) {
    const state = declared.get(id);
    if (state !== undefined) {
      yield* validated(
        state.schema,
        input,
        `The input of the saved ${stage} stage's ${state.path} state`,
      );
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
  for (const { id, src, snapshot } of yield* readable(savedStagesOf(persisted))) {
    const source = lifecycle.sources.actors[src];
    if (source instanceof StateMachine) {
      yield* validated(snapshotSchema(source), snapshot, `The saved ${id} stage`);
      yield* checkSavedStateInputs(id, source, snapshot);
      yield* checkSavedSteps(id, source, snapshot);
    }
  }
});

/**
 * The saved work item `persisted`, once each of these fits what `lifecycle`
 * runs now: its lifecycle context and states, the saved snapshot of each
 * running stage machine, the input of each of that machine's active states,
 * and the task of each step running in it. Fails with `UnreadableSnapshot`
 * naming what does not (ADR 0002, ADR 0014, ADR 0016, ADR 0017).
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

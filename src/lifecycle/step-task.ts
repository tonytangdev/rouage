import { Schema } from "effect";
import type { AnyActorLogic, StandardSchemaV1 } from "xstate";

/** The Schema of the task a step is given: plain JSON data, saved as it is given. */
export type TaskSchema<Task> = Schema.Codec<Task, Task>;

// Kept beside the logic rather than as the input schema XState lets async
// logic declare, because XState neither exposes that schema on the logic nor
// checks a restored child's input against it (ADR 0016).
const taskSchemas = new WeakMap<AnyActorLogic, StandardSchemaV1<unknown, unknown>>();

/**
 * `logic`, declared to take a task fitting `task`, so a work item saved while
 * it runs inside a stage machine has the task it was saved with checked
 * against `task` when restored (ADR 0016).
 */
export const withTaskSchema = <Logic extends AnyActorLogic, Task>(
  logic: Logic,
  task: TaskSchema<Task>,
): Logic => {
  taskSchemas.set(logic, Schema.toStandardSchemaV1(task));
  return logic;
};

/** The Schema `logic` was declared with by `withTaskSchema`, as a Standard Schema that is also the Effect Schema; `undefined` for logic declared without one. */
export const taskSchemaOf = (
  logic: AnyActorLogic,
): StandardSchemaV1<unknown, unknown> | undefined => taskSchemas.get(logic);

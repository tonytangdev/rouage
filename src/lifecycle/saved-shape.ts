import { Schema } from "effect";
import type { AnyStateMachine, StandardSchemaV1 } from "xstate";

import { defaultLifecycle } from "./lifecycle.ts";
import { stateIdsOf, stateInputSchemasOf } from "./state-nodes.ts";
import { taskSchemaOf } from "./step-task.ts";
import { WorkItemContextSchema } from "./work-item.ts";

// A Standard Schema made by `Schema.toStandardSchemaV1` is the Effect Schema
// too, which alone gives a JSON Schema; any other is pinned as `null`.
const jsonSchemaOf = (schema: StandardSchemaV1<unknown, unknown> | undefined) =>
  Schema.isSchema(schema) ? Schema.toJsonSchemaDocument(schema) : null;

/**
 * What a saved work item of the default lifecycle depends on to restore:
 * the JSON Schema of its context and every state id. Pinned per lifecycle
 * version, so a change to either fails `pnpm check` until the version is
 * bumped (ADR 0002).
 */
export const savedShape = {
  version: defaultLifecycle.version,
  context: Schema.toJsonSchemaDocument(WorkItemContextSchema),
  states: stateIdsOf(defaultLifecycle.root),
};

/**
 * What a saved work item depends on to restore while `machine` runs as one of
 * its stages: the JSON Schema of the machine's context, every state id, by
 * state id the JSON Schema of the input each state declares it is entered
 * with, and, by source name, the JSON Schema of the task each step it invokes
 * is saved with. A context, state input or task declared without an Effect
 * Schema is `null` (ADR 0014, ADR 0016, ADR 0017).
 */
export const stageSavedShape = (machine: AnyStateMachine) => ({
  context: jsonSchemaOf(machine.schemas?.context),
  states: stateIdsOf(machine.root),
  stateInputs: Object.fromEntries(
    [...stateInputSchemasOf(machine.root)].map(([id, { schema }]) => [id, jsonSchemaOf(schema)]),
  ),
  steps: Object.fromEntries(
    Object.entries(machine.sources.actors).map(([source, logic]) => [
      source,
      jsonSchemaOf(taskSchemaOf(logic)),
    ]),
  ),
});

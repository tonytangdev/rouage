import { Schema } from "effect";

import { defaultLifecycle } from "./lifecycle.ts";
import { WorkItemContextSchema } from "./work-item.ts";

interface StateTree {
  readonly id: string;
  readonly states: Readonly<Record<string, StateTree>>;
}

const stateIdsOf = (node: StateTree): readonly string[] => [
  node.id,
  ...Object.values(node.states).flatMap(stateIdsOf),
];

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

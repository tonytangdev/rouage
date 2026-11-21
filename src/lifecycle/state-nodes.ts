import type { StandardSchemaV1 } from "xstate";

interface StateTree {
  readonly id: string;
  readonly path: readonly string[];
  readonly schemas: { readonly input?: StandardSchemaV1 } | undefined;
  readonly states: Readonly<Record<string, StateTree>>;
}

/** `root` and every state below it, parents before their children. */
export const stateNodesOf = (root: StateTree): readonly StateTree[] => [
  root,
  ...Object.values(root.states).flatMap(stateNodesOf),
];

/** The id of `root` and of every state below it. */
export const stateIdsOf = (root: StateTree) => stateNodesOf(root).map(({ id }) => id);

/**
 * Every state below `root` that declares the input it is entered with, by its
 * state id, with its path from `root` and that input's Schema. A machine's
 * root is left out because its `schemas` are the machine's own, so its
 * `input` is the actor's input, not a state's.
 */
export const stateInputSchemasOf = (root: StateTree) =>
  new Map(
    Object.values(root.states)
      .flatMap(stateNodesOf)
      .flatMap(({ id, path, schemas }) =>
        schemas?.input === undefined ? [] : [[id, { path: path.join("."), schema: schemas.input }]],
      ),
  );

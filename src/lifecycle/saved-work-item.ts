import { Data, Effect, Schema } from "effect";

/** A saved work item as plain JSON, as a work item saves it and a store gives it back. */
export const SavedWorkItemSchema = Schema.Record(Schema.String, Schema.Unknown);
export type SavedWorkItem = typeof SavedWorkItemSchema.Type;

/** A stage running in a saved work item: its id, the name of its logic among the lifecycle's actors, and its saved snapshot. */
export interface SavedStage {
  readonly id: string;
  readonly src: string;
  readonly snapshot: unknown;
}

/** A step running in a saved stage: its id, the name of its logic among the stage machine's actors, and the task it was saved with. */
export interface SavedStep {
  readonly id: string;
  readonly src: string;
  readonly task: unknown;
}

/** The stage a saved work item was to be changed in is not running in it. */
export class SavedStageNotRunning extends Data.TaggedError("SavedStageNotRunning")<{
  readonly stage: string;
}> {}

// The layout XState v6 persists a machine snapshot in; only the fields read
// here are decoded, so a newer XState field does not make a snapshot unreadable.
const SavedChildren = Schema.Struct({
  children: Schema.Record(
    Schema.String,
    Schema.Struct({
      src: Schema.optional(Schema.String),
      snapshot: Schema.optional(Schema.Unknown),
    }),
  ),
});

const SavedStepSnapshot = Schema.Struct({
  status: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Unknown),
});

const SavedStateInputs = Schema.Struct({
  stateInputs: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

// A child without a source or a snapshot is not one XState restores, so it is no running stage or step.
const runningChildrenOf = Effect.fnUntraced(function* (parent: unknown) {
  const { children } = yield* Schema.decodeUnknownEffect(SavedChildren)(parent);
  return Object.entries(children).flatMap(([id, { src, snapshot }]) =>
    src === undefined || snapshot === undefined ? [] : [{ id, src, snapshot }],
  );
});

/** The stages running in the saved work item `persisted`, each with its saved snapshot; fails with a `SchemaError` when `persisted` is not laid out as XState saves a machine. */
export const savedStagesOf = (persisted: unknown) => runningChildrenOf(persisted);

/**
 * The steps running in the saved stage snapshot `stage`, each with the task
 * it was saved with. A step that finished or failed is left out because
 * XState drops its input. Fails with a `SchemaError` when `stage` is not laid
 * out as XState saves a machine.
 */
export const savedStepsOf = Effect.fnUntraced(function* (stage: unknown) {
  const steps: SavedStep[] = [];
  for (const { id, src, snapshot } of yield* runningChildrenOf(stage)) {
    const { status, input } = yield* Schema.decodeUnknownEffect(SavedStepSnapshot)(snapshot);
    if (status === "active") {
      steps.push({ id, src, task: input });
    }
  }
  return steps;
});

/**
 * The saved input of each state active in the saved stage snapshot `stage`,
 * by state id, empty when it saved none. Fails with a `SchemaError` when
 * `stage` is not laid out as XState saves a machine.
 */
export const savedStateInputsOf = Effect.fnUntraced(function* (stage: unknown) {
  const { stateInputs = {} } = yield* Schema.decodeUnknownEffect(SavedStateInputs)(stage);
  return stateInputs;
});

const objectIn = Schema.decodeUnknownEffect(SavedWorkItemSchema);

// Edited as plain records rather than through the schemas above, because
// those drop every field they do not read.
const withChildSnapshot = Effect.fnUntraced(function* (
  parent: unknown,
  id: string,
  change: (snapshot: SavedWorkItem) => Effect.Effect<SavedWorkItem, Schema.SchemaError>,
) {
  const saved = yield* objectIn(parent);
  const children = yield* objectIn(saved["children"]);
  const child = yield* objectIn(children[id]);
  const snapshot = yield* change(yield* objectIn(child["snapshot"]));
  return { ...saved, children: { ...children, [id]: { ...child, snapshot } } };
});

const withSavedStage = Effect.fnUntraced(function* (
  persisted: unknown,
  stage: string,
  change: (snapshot: SavedWorkItem) => Effect.Effect<SavedWorkItem, Schema.SchemaError>,
) {
  const running = yield* savedStagesOf(persisted);
  if (!running.some(({ id }) => id === stage)) {
    return yield* new SavedStageNotRunning({ stage });
  }
  return yield* withChildSnapshot(persisted, stage, change);
});

/** `persisted` with the saved context of its running `stage` replaced by `context`; fails with `SavedStageNotRunning` when `stage` is not running in it. */
export const withSavedStageContext = (persisted: unknown, stage: string, context: unknown) =>
  withSavedStage(persisted, stage, (snapshot) => Effect.succeed({ ...snapshot, context }));

/** `persisted` with the task of each step running in its running `stage` replaced by `task`, leaving every other step as saved; fails with `SavedStageNotRunning` when `stage` is not running in it. */
export const withSavedStepTask = (persisted: unknown, stage: string, task: unknown) =>
  withSavedStage(
    persisted,
    stage,
    Effect.fnUntraced(function* (snapshot) {
      let changed = snapshot;
      for (const step of yield* savedStepsOf(snapshot)) {
        changed = yield* withChildSnapshot(changed, step.id, (saved) =>
          Effect.succeed({ ...saved, input: task }),
        );
      }
      return changed;
    }),
  );

/** `persisted` with the saved input of each state active in its running `stage` replaced by `input`; fails with `SavedStageNotRunning` when `stage` is not running in it. */
export const withSavedStateInput = (persisted: unknown, stage: string, input: unknown) =>
  withSavedStage(
    persisted,
    stage,
    Effect.fnUntraced(function* (snapshot) {
      const states = Object.keys(yield* savedStateInputsOf(snapshot));
      return {
        ...snapshot,
        stateInputs: Object.fromEntries(states.map((state) => [state, input])),
      };
    }),
  );

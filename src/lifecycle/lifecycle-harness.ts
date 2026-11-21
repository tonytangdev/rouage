import { Effect, Schema } from "effect";

import type { FakeSandboxTeardown } from "./fake-sandbox-teardown.ts";
import { fakeSandboxTeardown } from "./fake-sandbox-teardown.ts";
import type { RealStages, Route, Running, Waypoint } from "./golden-route.ts";
import { StageNotRunning, advance, newWorkItem, stubController } from "./golden-route.ts";
import type { LifecycleMigration } from "./lifecycle-migration.ts";
import { SavedWorkItemSchema } from "./lifecycle-migration.ts";
import type { FailureReason, OutcomeOf, StageName } from "./stage.ts";
import type { WorkItem } from "./work-item-actor.ts";
import { createWorkItem, restoreWorkItem } from "./work-item-actor.ts";

/** How a test sets up its work item: real stages to run instead of stubs, the sandbox teardown to record, and the migrations a restore may use. */
export interface WorkItemOptions {
  readonly stages?: RealStages;
  readonly sandbox?: FakeSandboxTeardown;
  readonly migrations?: readonly LifecycleMigration[];
}

const drive = (workItem: WorkItem, running: Running, sandbox: FakeSandboxTeardown) => {
  const stub = (stage: StageName) => {
    const found = running.get(stage);
    if (found === undefined) {
      throw new StageNotRunning({ stage, actual: workItem.state() });
    }
    return found.self;
  };
  return {
    ...workItem,
    /** Every sandbox teardown the work item asked for, in order. */
    teardowns: sandbox.tasks,
    stageInput: (stage: StageName) => running.get(stage)?.input,
    finish: <Stage extends StageName>(stage: Stage, outcome: OutcomeOf<Stage>) => {
      stub(stage).send({ type: "finish", outcome });
    },
    fail: (stage: StageName, reason: FailureReason) => {
      stub(stage).send({ type: "fail", reason });
    },
    crash: (stage: StageName, message: string) => {
      stub(stage).send({ type: "crash", message });
    },
    /** Approves every gate and finishes every stub stage with its golden outcome until the work item reaches `waypoint`; throws if `route` never passes it. */
    advanceTo: (waypoint: Waypoint, route: Route = {}) => {
      advance(workItem, running, waypoint, route);
    },
  };
};

/** A test work item: a work item plus the controls that drive its stub stages. */
export type TestWorkItem = ReturnType<typeof drive>;

const objectIn = Schema.decodeUnknownSync(SavedWorkItemSchema);

/** `persisted` with the saved context of its running `stage` replaced by `context`, as a stage machine whose context has changed since would find it; throws if `stage` is not running in it. */
export const withStageContext = (persisted: unknown, stage: StageName, context: unknown) => {
  const saved = objectIn(persisted);
  const children = objectIn(saved["children"]);
  const entry = objectIn(children[stage]);
  const snapshot = { ...objectIn(entry["snapshot"]), context };
  return { ...saved, children: { ...children, [stage]: { ...entry, snapshot } } };
};

/** Round-trips a saved work item through JSON, as a store that keeps it as text would. */
export const throughJson = (persisted: unknown): unknown => JSON.parse(JSON.stringify(persisted));

/** Starts the test work item on the default lifecycle, set up by `options`, for the length of the test. */
export const startWorkItem = Effect.fnUntraced(function* (options: WorkItemOptions = {}) {
  const { running, lifecycle } = stubController(options.stages ?? {});
  const sandbox = options.sandbox ?? fakeSandboxTeardown();
  const workItem = yield* createWorkItem(lifecycle, newWorkItem).pipe(
    Effect.provide(sandbox.layer),
  );
  return drive(workItem, running, sandbox);
});

/** Starts the test work item and advances it to `waypoint` along `route`. */
export const startWorkItemAt = Effect.fnUntraced(function* (waypoint: Waypoint, route: Route = {}) {
  const workItem = yield* startWorkItem();
  workItem.advanceTo(waypoint, route);
  return workItem;
});

/** Resumes a saved work item on the default lifecycle, set up by `options`, for the length of the test. */
export const restoredWorkItem = Effect.fnUntraced(function* (
  persisted: unknown,
  options: WorkItemOptions = {},
) {
  const { running, lifecycle } = stubController(options.stages ?? {});
  const sandbox = options.sandbox ?? fakeSandboxTeardown();
  const workItem = yield* restoreWorkItem(lifecycle, persisted, options.migrations).pipe(
    Effect.provide(sandbox.layer),
  );
  return drive(workItem, running, sandbox);
});

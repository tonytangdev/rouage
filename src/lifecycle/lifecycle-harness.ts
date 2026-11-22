import { Data, Effect, Schema } from "effect";
import { createActor } from "xstate";

import type { StageFacts } from "./facts.ts";
import type { FakeSandboxTeardown } from "./fake-sandbox-teardown.ts";
import { fakeSandboxTeardown } from "./fake-sandbox-teardown.ts";
import type { LifecycleMigration } from "./lifecycle-migration.ts";
import type { Gate, Place } from "./place.ts";
import { isGate, placeOf } from "./place.ts";
import {
  withSavedStageContext,
  withSavedStateInput,
  withSavedStepTask,
} from "./saved-work-item.ts";
import type { FailureReason, OutcomeOf, StageInput, StageName } from "./stage.ts";
import { StageNameSchema } from "./stage.ts";
import type { RealStages, Running } from "./stub-controller.ts";
import { stubController } from "./stub-controller.ts";
import type { Route } from "./test-fixtures.ts";
import { goldenOutcome, inputAfterPassing, newWorkItem, reviewer } from "./test-fixtures.ts";
import type { WorkItem } from "./work-item-actor.ts";
import { createWorkItem, restoreWorkItem } from "./work-item-actor.ts";

/** Thrown when a test drives a stage the work item is not in, so the test fails at the step that went wrong. */
export class StageNotRunning extends Data.TaggedError("StageNotRunning")<{
  readonly stage: StageName;
  readonly actual: Place;
}> {}

/** A place in the default lifecycle a test can advance a work item to: a stage or a gate. */
export type Waypoint = StageName | Gate;

/** Thrown when a test advances a work item to a waypoint it never reaches on its route, such as Demo when no demo is planned. */
export class WaypointNotOnRoute extends Data.TaggedError("WaypointNotOnRoute")<{
  readonly waypoint: Waypoint;
  readonly actual: Place;
}> {}

const isStageName = Schema.is(StageNameSchema);

/** How a test sets up its work item: real stages to run instead of stubs, the sandbox teardown to record, and the migrations a restore may use. */
export interface WorkItemOptions {
  readonly stages?: RealStages;
  readonly sandbox?: FakeSandboxTeardown;
  readonly migrations?: readonly LifecycleMigration[];
}

type Steerable = Pick<WorkItem, "state" | "send">;

const steer = (workItem: Steerable, running: Running) => {
  const stub = (stage: StageName) => {
    const found = running.get(stage);
    if (found === undefined) {
      throw new StageNotRunning({ stage, actual: workItem.state() });
    }
    return found.self;
  };
  const finish = <Stage extends StageName>(stage: Stage, outcome: OutcomeOf<Stage>) => {
    stub(stage).send({ type: "finish", outcome });
  };
  const advanceTo = (waypoint: Waypoint, route: Route = {}) => {
    const finished: StageName[] = [];
    for (let state = workItem.state(); state !== waypoint; state = workItem.state()) {
      if (isGate(state)) {
        workItem.send({ type: "approve", ...reviewer });
      } else if (isStageName(state) && running.has(state)) {
        finish(state, goldenOutcome(state, route));
        finished.push(state);
      } else {
        throw new WaypointNotOnRoute({ waypoint, actual: state });
      }
    }
    return finished;
  };
  return {
    stageInput: (stage: StageName) => running.get(stage)?.input,
    finish,
    fail: (stage: StageName, reason: FailureReason) => {
      stub(stage).send({ type: "fail", reason });
    },
    crash: (stage: StageName, message: string) => {
      stub(stage).send({ type: "crash", message });
    },
    /**
     * Approves every gate and finishes every stub stage with its golden outcome
     * until the work item reaches `waypoint`; throws if `route` never passes it.
     * Returns the stages it finished, in order.
     */
    advanceTo,
  };
};

/** A work item's place and the controls that drive its stub stages, the same whether it runs in an Effect or at once. */
export type StubControls = Steerable & ReturnType<typeof steer>;

/** A test work item: a work item plus the controls that drive its stub stages. */
export interface TestWorkItem extends WorkItem, StubControls {
  /** Every sandbox teardown the work item asked for, in order. */
  readonly teardowns: FakeSandboxTeardown["tasks"];
}

const drive = (
  workItem: WorkItem,
  running: Running,
  sandbox: FakeSandboxTeardown,
): TestWorkItem => ({ ...workItem, teardowns: sandbox.tasks, ...steer(workItem, running) });

/** `persisted` with the saved context of its running `stage` replaced by `context`, as a stage machine whose context has changed since would find it; throws if `stage` is not running in it. */
export const withStageContext = (persisted: unknown, stage: StageName, context: unknown) =>
  Effect.runSync(withSavedStageContext(persisted, stage, context));

/** `persisted` with the saved task of each step running in its `stage` replaced by `task`, as a port whose task has changed since would find it; throws if `stage` is not running in it. */
export const withStepTask = (persisted: unknown, stage: StageName, task: unknown) =>
  Effect.runSync(withSavedStepTask(persisted, stage, task));

/** `persisted` with the saved input of each state active in its running `stage` replaced by `input`, as a stage machine whose state input has changed since would find it; throws if `stage` is not running in it. */
export const withStateInput = (persisted: unknown, stage: StageName, input: unknown) =>
  Effect.runSync(withSavedStateInput(persisted, stage, input));

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

// A bare actor rather than `createWorkItem` under `Effect.runSync`, because
// closing the scope of a work item that has reached its final state waits for
// its sandbox teardown, which XState only reports asynchronously.
const readAtOnce = <A>(read: (workItem: StubControls) => A): A => {
  const { running, lifecycle } = stubController({});
  const actor = createActor(lifecycle, { input: newWorkItem }).start();
  const workItem: Steerable = {
    state: () => placeOf(actor.getSnapshot().value),
    send: (event) => {
      actor.send(event);
    },
  };
  try {
    return read({ ...workItem, ...steer(workItem, running) });
  } finally {
    actor.stop();
  }
};

/**
 * The input a stage receives once the work item has passed every stage on
 * `route` up to and including `lastPassed`, with `changes` on top, so a test
 * states only the facts its own transition sets. Runs at once, outside any Effect.
 */
export const inputAfter = (
  lastPassed: StageName,
  route: Route = {},
  changes: Partial<StageFacts> = {},
): StageInput =>
  readAtOnce((workItem) =>
    inputAfterPassing([...workItem.advanceTo(lastPassed, route), lastPassed], route, changes),
  );

/** The input `stage` receives when the work item first reaches it along `route`, as the lifecycle gives it. Runs at once, outside any Effect. */
export const inputOnReaching = (stage: StageName, route: Route = {}): StageInput =>
  readAtOnce((workItem) => {
    workItem.advanceTo(stage, route);
    const input = workItem.stageInput(stage);
    if (input === undefined) {
      throw new StageNotRunning({ stage, actual: workItem.state() });
    }
    return input;
  });

/** Where the lifecycle sends the work item once `stage`, reached along `route`, finishes with `outcome`. Runs at once, outside any Effect. */
export const nextAfter = <Stage extends StageName>(
  stage: Stage,
  outcome: OutcomeOf<Stage>,
  route: Route = {},
): Place =>
  readAtOnce((workItem) => {
    workItem.advanceTo(stage, route);
    workItem.finish(stage, outcome);
    return workItem.state();
  });

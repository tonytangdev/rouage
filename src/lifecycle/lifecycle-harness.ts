import { Data, Effect, Schema } from "effect";
import type { AnyActorRef, AnyStateMachine, EventFrom } from "xstate";
import { createActor } from "xstate";

import { defaultLifecycle } from "./lifecycle.ts";
import { perLoop } from "./loops.ts";
import type { FailureReason, Kind, OutcomeOf, StageFacts, StageInput, StageName } from "./stage.ts";
import { StageNameSchema, noFactsYet } from "./stage.ts";
import { innermostState } from "./state-value.ts";
import type { AttachStub } from "./stub-stage.ts";
import { stubStages } from "./stub-stage.ts";
import type { WorkItem } from "./work-item-actor.ts";
import { createWorkItem, restoreWorkItem } from "./work-item-actor.ts";

/** Thrown when a test drives a stage the work item is not in, so the test fails at the step that went wrong. */
export class StageNotRunning extends Data.TaggedError("StageNotRunning")<{
  readonly stage: StageName;
  readonly actual: string;
}> {}

interface RunningStub {
  readonly self: AnyActorRef;
  readonly input: StageInput;
}

/** Real stage implementations to run instead of stubs; every other stage stays a stub. */
export type RealStages = Partial<Readonly<Record<StageName, AnyStateMachine>>>;

const stubController = (real: RealStages) => {
  const running = new Map<StageName, RunningStub>();
  const attach: AttachStub = (stage, self, input) => {
    running.set(stage, { self, input });
    return () => {
      if (running.get(stage)?.self === self) {
        running.delete(stage);
      }
    };
  };
  return {
    running,
    lifecycle: defaultLifecycle.provide({ actors: { ...stubStages(attach), ...real } }),
  };
};

/** The input a stage of the test work item receives: no facts yet except `facts`. */
export const stageInputWith = (facts: Partial<StageFacts> = {}): StageInput => ({
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  ...noFactsYet,
  ...facts,
});

/** A human deciding at a gate or for a blocked work item, as tests send them. */
export const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" } as const;

/** A place in the default lifecycle a test can advance a work item to: a stage or a gate. */
export type Waypoint = StageName | "specGate" | "shipGate";

/** How the golden outcomes route a work item through the default lifecycle; a feature with no demo unless set. */
export interface Route {
  readonly kind?: Kind;
  readonly demo?: boolean;
}

/** Thrown when a test advances a work item to a waypoint it never reaches on its route, such as Demo when no demo is planned. */
export class WaypointNotOnRoute extends Data.TaggedError("WaypointNotOnRoute")<{
  readonly waypoint: Waypoint;
  readonly actual: string;
}> {}

const gates: ReadonlySet<string> = new Set(["specGate", "shipGate"]);

const isStageName = Schema.is(StageNameSchema);

/** The test work item's ID and issue, and the references its stages produce with their golden outcomes, named so fixtures need not retype them. */
export const goldenRefs = {
  workItemId: "wi-1",
  issueRef: "#1",
  specRef: "spec-1",
  sandboxRef: "box-1",
  reproductionRef: "repro-1",
  planRef: "plan-1",
  demoRef: "demo-1",
  deliveryRef: "delivery-1",
} as const;

/** The test work item as it is created: loop limits of 3, whatever the environment says. */
const newWorkItem = {
  id: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  limits: perLoop(() => 3),
};

interface GoldenStep<Stage extends StageName> {
  readonly outcome: OutcomeOf<Stage>;
  readonly teaches: Partial<StageFacts>;
}

// `teaches` is written out rather than derived from `outcome`, because a
// derivation would repeat the lifecycle's own mapping and agree with it by construction.
const goldenPath = (route: Route): { readonly [Stage in StageName]: GoldenStep<Stage> } => {
  const kind = route.kind ?? "feature";
  const demo = route.demo ?? false;
  const { specRef, sandboxRef, reproductionRef, planRef, demoRef, deliveryRef } = goldenRefs;
  return {
    intake: { outcome: { _tag: "classified", kind }, teaches: { kind } },
    spec: { outcome: { _tag: "written", specRef }, teaches: { specRef } },
    provision: {
      outcome: { _tag: "provisioned", sandboxRef, sampleRef: null },
      teaches: { sandboxRef, sampleRef: null },
    },
    reproduce: { outcome: { _tag: "reproduced", reproductionRef }, teaches: { reproductionRef } },
    plan: { outcome: { _tag: "planned", planRef, demo }, teaches: { planRef, demoPlanned: demo } },
    build: { outcome: { _tag: "built" }, teaches: {} },
    demo: { outcome: { _tag: "demonstrated", demoRef }, teaches: { demoRef } },
    review: { outcome: { _tag: "approved" }, teaches: {} },
    ship: { outcome: { _tag: "shipped", deliveryRef }, teaches: { deliveryRef } },
  };
};

type Running = ReadonlyMap<StageName, RunningStub>;

interface Steerable {
  readonly state: () => string;
  readonly send: (event: EventFrom<typeof defaultLifecycle>) => void;
}

const finishGolden = (running: Running, stage: StageName, route: Route) => {
  running.get(stage)?.self.send({ type: "finish", outcome: goldenPath(route)[stage].outcome });
};

/**
 * Approves each gate and finishes each running stub with its golden outcome,
 * wherever the lifecycle routes the work item, until it reaches `waypoint`.
 * Returns the stages it finished, in order.
 */
const advance = (workItem: Steerable, running: Running, waypoint: Waypoint, route: Route) => {
  const finished: StageName[] = [];
  for (let state = workItem.state(); state !== waypoint; state = workItem.state()) {
    if (gates.has(state)) {
      workItem.send({ type: "approve", ...reviewer });
    } else if (isStageName(state) && running.has(state)) {
      finishGolden(running, state, route);
      finished.push(state);
    } else {
      throw new WaypointNotOnRoute({ waypoint, actual: state });
    }
  }
  return finished;
};

/** A work item on the default lifecycle with every stage a stub, advanced to `waypoint` along `route` at once, outside any Effect, so a test declaration can read it while its module loads. */
const walkTo = (waypoint: Waypoint, route: Route) => {
  const { running, lifecycle } = stubController({});
  const actor = createActor(lifecycle, { input: newWorkItem }).start();
  const workItem: Steerable = {
    state: () => innermostState(actor.getSnapshot().value),
    send: (event) => {
      actor.send(event);
    },
  };
  const passed = advance(workItem, running, waypoint, route);
  return { actor, workItem, running, passed };
};

/**
 * The input a stage receives once the work item has passed every stage on
 * `route` up to and including `lastPassed`, with `changes` on top, so a test
 * states only the facts its own transition sets.
 */
export const inputAfter = (
  lastPassed: StageName,
  route: Route = {},
  changes: Partial<StageFacts> = {},
): StageInput => {
  const walk = walkTo(lastPassed, route);
  walk.actor.stop();
  return inputFrom([...walk.passed, lastPassed], route, changes);
};

/** The input `stage` receives when the work item first reaches it along `route`, as the lifecycle gives it. */
export const inputOnReaching = (stage: StageName, route: Route = {}): StageInput => {
  const walk = walkTo(stage, route);
  const input = walk.running.get(stage)?.input;
  walk.actor.stop();
  if (input === undefined) {
    throw new StageNotRunning({ stage, actual: walk.workItem.state() });
  }
  return input;
};

/** Where the lifecycle sends the work item once `stage` finishes with its golden outcome on `route`. */
export const nextAfter = (stage: StageName, route: Route = {}): string => {
  const walk = walkTo(stage, route);
  finishGolden(walk.running, stage, route);
  const next = walk.workItem.state();
  walk.actor.stop();
  return next;
};

const inputFrom = (
  passed: readonly StageName[],
  route: Route,
  changes: Partial<StageFacts>,
): StageInput => {
  const path = goldenPath(route);
  const learnt: Partial<StageFacts> = {};
  for (const stage of passed) {
    Object.assign(learnt, path[stage].teaches);
  }
  return stageInputWith({ ...learnt, ...changes });
};

const drive = (workItem: WorkItem, running: Running) => {
  const stub = (stage: StageName) => {
    const found = running.get(stage);
    if (found === undefined) {
      throw new StageNotRunning({ stage, actual: workItem.state() });
    }
    return found.self;
  };
  return {
    stage: workItem.state,
    status: workItem.status,
    context: workItem.context,
    save: workItem.save,
    reaches: workItem.reaches,
    send: workItem.send,
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
    /** Approves every gate and finishes every stub stage with its golden outcome until the work item reaches `waypoint`; throws `WaypointNotOnRoute` if `route` never passes it. */
    advanceTo: (waypoint: Waypoint, route: Route = {}) => {
      advance({ state: workItem.state, send: workItem.send }, running, waypoint, route);
    },
  };
};

/** Round-trips a saved work item through JSON, as a store that keeps it as text would. */
export const throughJson = (persisted: unknown): unknown => JSON.parse(JSON.stringify(persisted));

/** Starts the test work item on the default lifecycle, with a stub for every stage not in `real`, for the length of the test. */
export const startWorkItem = Effect.fnUntraced(function* (real: RealStages = {}) {
  const { running, lifecycle } = stubController(real);
  const workItem = yield* createWorkItem(lifecycle, newWorkItem);
  return drive(workItem, running);
});

/** Resumes a saved work item on the default lifecycle, with a stub for every stage not in `real`, for the length of the test. */
export const restoredWorkItem = Effect.fnUntraced(function* (
  persisted: unknown,
  real: RealStages = {},
) {
  const { running, lifecycle } = stubController(real);
  return drive(yield* restoreWorkItem(lifecycle, persisted), running);
});

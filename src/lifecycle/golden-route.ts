import { Data, Schema, Struct } from "effect";
import type { AnyActorRef, AnyStateMachine, EventFrom } from "xstate";
import { createActor } from "xstate";

import { demoFactNames } from "./demo-decision.ts";
import type { StageFacts } from "./facts.ts";
import { noFactsYet } from "./facts.ts";
import type { Kind } from "./kind.ts";
import { defaultLifecycle } from "./lifecycle.ts";
import { perLoop } from "./loops.ts";
import type { Gate, Place } from "./place.ts";
import { isGate, placeOf } from "./place.ts";
import type { OutcomeOf, StageInput, StageName } from "./stage.ts";
import { StageNameSchema } from "./stage.ts";
import type { AttachStub } from "./stub-stage.ts";
import { stubStages } from "./stub-stage.ts";

/** Thrown when a test drives a stage the work item is not in, so the test fails at the step that went wrong. */
export class StageNotRunning extends Data.TaggedError("StageNotRunning")<{
  readonly stage: StageName;
  readonly actual: Place;
}> {}

interface RunningStub {
  readonly self: AnyActorRef;
  readonly input: StageInput;
}

/** Real stage implementations to run instead of stubs; every other stage stays a stub. */
export type RealStages = Partial<Readonly<Record<StageName, AnyStateMachine>>>;

/** The default lifecycle with a stub for every stage not in `real`, and the stubs running now, by stage. */
export const stubController = (real: RealStages) => {
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

/** The input a stage of the test work item receives: no facts yet and no demo to see, except `fields`. */
export const stageInputWith = (
  fields: Partial<Omit<StageInput, "workItemId">> = {},
): StageInput => ({
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  ...Struct.omit(noFactsYet, demoFactNames),
  demoRef: null,
  ...fields,
});

/** A human deciding at a gate or for a blocked work item, as tests send them. */
export const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" } as const;

/** A place in the default lifecycle a test can advance a work item to: a stage or a gate. */
export type Waypoint = StageName | Gate;

/** How the golden outcomes route a work item through the default lifecycle; a feature with no demo unless set. */
export interface Route {
  readonly kind?: Kind;
  readonly demo?: boolean;
}

/** Thrown when a test advances a work item to a waypoint it never reaches on its route, such as Demo when no demo is planned. */
export class WaypointNotOnRoute extends Data.TaggedError("WaypointNotOnRoute")<{
  readonly waypoint: Waypoint;
  readonly actual: Place;
}> {}

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
export const newWorkItem = {
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
    build: { outcome: { _tag: "built" }, teaches: { demoOutdated: true } },
    demo: {
      outcome: { _tag: "demonstrated", demoRef },
      teaches: { demoRef, demoOutdated: false },
    },
    review: { outcome: { _tag: "approved" }, teaches: {} },
    ship: { outcome: { _tag: "shipped", deliveryRef }, teaches: { deliveryRef } },
  };
};

/** The stub stages running now, by stage. */
export type Running = ReadonlyMap<StageName, RunningStub>;

interface Steerable {
  readonly state: () => Place;
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
export const advance = (
  workItem: Steerable,
  running: Running,
  waypoint: Waypoint,
  route: Route,
) => {
  const finished: StageName[] = [];
  for (let state = workItem.state(); state !== waypoint; state = workItem.state()) {
    if (isGate(state)) {
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
    state: () => placeOf(actor.getSnapshot().value),
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
export const nextAfter = (stage: StageName, route: Route = {}): Place => {
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
  // Golden routes in these helpers never show a stage a demo, so the demo facts
  // drop out rather than restating the lifecycle's own demo rule.
  return stageInputWith({ ...Struct.omit({ ...learnt, ...changes }, demoFactNames) });
};

import { Struct } from "effect";

import { demoFactNames } from "./demo-decision.ts";
import type { StageFacts } from "./facts.ts";
import { noFactsYet } from "./facts.ts";
import type { Kind } from "./kind.ts";
import { perLoop } from "./loops.ts";
import type { OutcomeOf, StageInput, StageName } from "./stage.ts";

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

/** A human deciding at a gate or for a blocked work item, as tests send them. */
export const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" } as const;

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

/** How the golden outcomes route a work item through the default lifecycle; a feature with no demo unless set. */
export interface Route {
  readonly kind?: Kind;
  readonly demo?: boolean;
}

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

/** The outcome `stage` finishes with on `route` when a test walks the golden route. */
export const goldenOutcome = <Stage extends StageName>(
  stage: Stage,
  route: Route,
): OutcomeOf<Stage> => goldenPath(route)[stage].outcome;

/**
 * The input a stage receives once the work item has finished each of `passed`
 * with its golden outcome on `route`, with `changes` on top.
 */
export const inputAfterPassing = (
  passed: readonly StageName[],
  route: Route,
  changes: Partial<StageFacts>,
): StageInput => {
  const path = goldenPath(route);
  const learnt: Partial<StageFacts> = {};
  for (const stage of passed) {
    Object.assign(learnt, path[stage].teaches);
  }
  // Golden routes never show a stage a demo, so the demo facts drop out rather
  // than restating the lifecycle's own demo rule.
  return stageInputWith({ ...Struct.omit({ ...learnt, ...changes }, demoFactNames) });
};

import { Effect } from "effect";

import { goldenRefs } from "../../lifecycle/golden-route.ts";
import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { FakePlannerScript } from "./fake-planner.ts";
import { fakePlanner, plannerPort } from "./fake-planner.ts";
import { planStage } from "./plan-stage.ts";

export const plannedWithDemo = { planRef: "plan-1", demo: true } as const;

/** What the planner is asked on a feature's first plan. */
export const firstPlan = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  kind: "feature",
  specRef: goldenRefs.specRef,
  sandboxRef: goldenRefs.sandboxRef,
  sampleRef: null,
  reproductionRef: null,
  previousPlanRef: null,
} as const;

export const planUnderTest = portStageUnderTest({
  name: "plan",
  port: plannerPort,
  scripted: Effect.fnUntraced(function* (script: FakePlannerScript) {
    const fake = yield* fakePlanner(script);
    return { fake, stage: yield* planStage.pipe(Effect.provide(fake.layer)) };
  }),
  passing: (misbehaving) => ({ plans: [plannedWithDemo], misbehaving }),
  outcome: { _tag: "planned", ...plannedWithDemo },
  firstTask: firstPlan,
});

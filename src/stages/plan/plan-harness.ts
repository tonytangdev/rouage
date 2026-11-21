import { Effect } from "effect";

import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { FakePlannerScript } from "./fake-planner.ts";
import { fakePlanner, plannerPort } from "./fake-planner.ts";
import { planStage } from "./plan-stage.ts";

export const plannedWithDemo = { planRef: "plan-1", demo: true } as const;

/** What the planner is asked on a feature's first plan. */
export const firstPlan = {
  workItemId: "wi-1",
  issueRef: "#1",
  kind: "feature",
  specRef: "spec-1",
  sandboxRef: "box-1",
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
  outcome: { _tag: "planned", planRef: "plan-1", demo: true },
  next: "build",
  firstTask: firstPlan,
});

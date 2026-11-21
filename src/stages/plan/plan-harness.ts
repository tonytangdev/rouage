import { goldenRefs } from "../../lifecycle/lifecycle-harness.ts";
import { portStageUnderTest, scriptedStage } from "../port-stage-under-test.ts";
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
  feedback: null,
} as const;

export const planUnderTest = portStageUnderTest({
  name: "plan",
  port: plannerPort,
  scripted: scriptedStage(fakePlanner, planStage),
  passing: (misbehaving) => ({ plans: [plannedWithDemo], misbehaving }),
  outcome: { _tag: "planned", ...plannedWithDemo },
  firstTask: firstPlan,
});

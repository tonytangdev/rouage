import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { plannerPort } from "./fake-planner.ts";
import { firstPlan, plannedWithDemo, scriptedPlan } from "./plan-harness.ts";

describe("a work item in the Plan stage", () => {
  it.effect("goes on to Build holding the plan and its demo decision", () =>
    Effect.gen(function* () {
      const { plan } = yield* scriptedPlan({ plans: [plannedWithDemo] });
      const workItem = yield* startWorkItem({ plan });
      workItem.advanceTo("plan");
      yield* workItem.reaches("build");
      expect(workItem.context().facts).toMatchObject({ planRef: "plan-1", demoPlanned: true });
    }),
  );
});

describePortStageInLifecycle({
  name: "plan",
  port: plannerPort,
  scripted: (misbehaving) =>
    Effect.map(scriptedPlan({ plans: [plannedWithDemo], misbehaving }), ({ planner, plan }) => ({
      fake: planner,
      stage: plan,
    })),
  next: "build",
  firstTask: firstPlan,
});

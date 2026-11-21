import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { plannedWithDemo, planUnderTest } from "./plan-harness.ts";

describe("a work item in the Plan stage", () => {
  it.effect("goes on to Build holding the plan and its demo decision", () =>
    Effect.gen(function* () {
      const { stage } = yield* planUnderTest.scripted({ plans: [plannedWithDemo] });
      const workItem = yield* startWorkItem({ stages: { plan: stage } });
      workItem.advanceTo("plan");
      yield* workItem.reaches("build");
      expect(workItem.context().facts).toMatchObject({ planRef: "plan-1", demoPlanned: true });
    }),
  );
});

describePortStageInLifecycle(planUnderTest);

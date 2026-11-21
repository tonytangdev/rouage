import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { restoredWorkItem, startWorkItem, throughJson } from "../../lifecycle/lifecycle-harness.ts";
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

  it.effect("becomes blocked on Plan when the planner gives up", () =>
    Effect.gen(function* () {
      const { plan } = yield* scriptedPlan({
        plans: [],
        misbehaving: { step: "plan", as: "failing" },
      });
      const workItem = yield* startWorkItem({ plan });
      workItem.advanceTo("plan");
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "plan",
        reason: { tag: "PlannerGaveUp", message: "The planner gave up during plan" },
      });
    }),
  );

  it.effect("plans again from the same task when restored mid-plan", () =>
    Effect.gen(function* () {
      const before = yield* scriptedPlan({
        plans: [],
        misbehaving: { step: "plan", as: "hanging" },
      });
      const original = yield* startWorkItem({ plan: before.plan });
      original.advanceTo("plan");
      yield* before.planner.started("plan");
      const after = yield* scriptedPlan({ plans: [plannedWithDemo] });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), { plan: after.plan });
      yield* workItem.reaches("build");
      expect(after.planner.tasks()).toStrictEqual([firstPlan]);
    }),
  );
});

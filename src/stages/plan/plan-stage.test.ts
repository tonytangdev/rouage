import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { describeStageContract } from "../../lifecycle/stage-contract.ts";
import { portAdapter } from "../port-stage-contract.ts";
import { plannerPort } from "./fake-planner.ts";
import { firstPlan, plannedWithDemo, provisionedFeature, runPlan } from "./plan-harness.ts";

describe("plan stage", () => {
  it.effect("finishes with the planner's plan and its demo decision", () =>
    Effect.gen(function* () {
      const { settled, tasks } = yield* runPlan({ plans: [plannedWithDemo] });
      expect(settled.output).toStrictEqual({ _tag: "planned", planRef: "plan-1", demo: true });
      expect(tasks).toStrictEqual([firstPlan]);
    }),
  );

  it.effect("revises the previous plan, given the bug's sample and reproduction", () =>
    Effect.gen(function* () {
      const { tasks } = yield* runPlan(
        { plans: [{ planRef: "plan-2", demo: false }] },
        {
          ...provisionedFeature,
          kind: "bug",
          sampleRef: "sample-1",
          reproductionRef: "repro-1",
          planRef: "plan-1",
          demoPlanned: true,
        },
      );
      expect(tasks).toStrictEqual([
        {
          ...firstPlan,
          kind: "bug",
          sampleRef: "sample-1",
          reproductionRef: "repro-1",
          previousPlanRef: "plan-1",
        },
      ]);
    }),
  );
});

describeStageContract(
  portAdapter({
    name: "plan",
    port: plannerPort,
    outcome: { _tag: "planned", planRef: "plan-1", demo: true },
    run: (misbehaving) => runPlan({ plans: [plannedWithDemo], misbehaving }),
  }),
);

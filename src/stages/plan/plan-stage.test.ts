import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { describePortStage } from "../port-stage-contract.ts";
import { firstPlan, planUnderTest } from "./plan-harness.ts";

describe("plan stage", () => {
  it.effect("revises the previous plan, given the bug's sample and reproduction", () =>
    Effect.gen(function* () {
      const { fake } = yield* planUnderTest.run(
        { plans: [{ planRef: "plan-2", demo: false }] },
        {
          ...planUnderTest.input,
          kind: "bug",
          sampleRef: "sample-1",
          reproductionRef: "repro-1",
          planRef: "plan-1",
          demoPlanned: true,
        },
      );
      expect(fake.tasks()).toStrictEqual([
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

describePortStage(planUnderTest);

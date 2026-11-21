import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { demoUnderTest, firstDemoMade } from "./demo-harness.ts";

describe("a work item in the Demo stage", () => {
  it.effect("goes on to Review holding the demo", () =>
    Effect.gen(function* () {
      const { stage } = yield* demoUnderTest.scripted({ demos: [firstDemoMade] });
      const workItem = yield* startWorkItem({ demo: stage });
      workItem.advanceTo("demo", { demo: true });
      yield* workItem.reaches("review");
      expect(workItem.context().facts).toMatchObject({ demoRef: "demo-1" });
    }),
  );
});

describePortStageInLifecycle(demoUnderTest);

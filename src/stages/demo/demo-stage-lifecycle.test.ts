import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { firstDemo, firstDemoMade, scriptedDemo } from "./demo-harness.ts";
import { demonstratorPort } from "./fake-demonstrator.ts";

describe("a work item in the Demo stage", () => {
  it.effect("goes on to Review holding the demo", () =>
    Effect.gen(function* () {
      const { demo } = yield* scriptedDemo({ demos: [firstDemoMade] });
      const workItem = yield* startWorkItem({ demo });
      workItem.advanceTo("demo", { demo: true });
      yield* workItem.reaches("review");
      expect(workItem.context().facts).toMatchObject({ demoRef: "demo-1" });
    }),
  );
});

describePortStageInLifecycle({
  name: "demo",
  port: demonstratorPort,
  scripted: (misbehaving) =>
    Effect.map(scriptedDemo({ demos: [firstDemoMade], misbehaving }), ({ demonstrator, demo }) => ({
      fake: demonstrator,
      stage: demo,
    })),
  route: { demo: true },
  next: "review",
  firstTask: firstDemo,
});

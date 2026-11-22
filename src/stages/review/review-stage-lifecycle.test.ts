import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { goldenRefs } from "../../lifecycle/test-fixtures.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { approval, changesRequested, firstReview, reviewUnderTest } from "./review-harness.ts";

describe("a work item in the Review stage", () => {
  it.effect("waits at the ship gate once the reviewer approves", () =>
    Effect.gen(function* () {
      const { stage } = yield* reviewUnderTest.scripted({ verdicts: [approval] });
      const workItem = yield* startWorkItem({ stages: { review: stage } });
      workItem.advanceTo("review");
      yield* workItem.reaches("shipGate");
      expect(workItem.context().blocked).toBeNull();
    }),
  );

  it.effect("shows the reviewer the reproduction and demo a bug gathered on its way", () =>
    Effect.gen(function* () {
      const { fake, stage } = yield* reviewUnderTest.scripted({ verdicts: [approval] });
      const workItem = yield* startWorkItem({ stages: { review: stage } });
      workItem.advanceTo("review", { kind: "bug", demo: true });
      yield* workItem.reaches("shipGate");
      expect(fake.tasks()).toStrictEqual([
        {
          ...firstReview,
          kind: "bug",
          reproductionRef: goldenRefs.reproductionRef,
          demoRef: goldenRefs.demoRef,
        },
      ]);
    }),
  );

  it.effect("goes back to Build with the reviewer's feedback when changes are requested", () =>
    Effect.gen(function* () {
      const { stage } = yield* reviewUnderTest.scripted({ verdicts: [changesRequested] });
      const workItem = yield* startWorkItem({ stages: { review: stage } });
      workItem.advanceTo("review");
      yield* workItem.reaches("build");
      expect(workItem.context().facts).toMatchObject({ feedback: "rename totals" });
    }),
  );
});

describePortStageInLifecycle(reviewUnderTest);

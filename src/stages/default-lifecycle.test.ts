import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { reviewer, startWorkItem } from "../lifecycle/lifecycle-harness.ts";
import { buildUnderTest } from "./build/build-harness.ts";
import { demoUnderTest, firstDemoMade } from "./demo/demo-harness.ts";
import { intakeUnderTest } from "./intake/intake-harness.ts";
import { planUnderTest } from "./plan/plan-harness.ts";
import { provisionUnderTest } from "./provision/provision-harness.ts";
import { captured, reproduceUnderTest } from "./reproduce/reproduce-harness.ts";
import { firstReview, reviewUnderTest } from "./review/review-harness.ts";
import { delivered, shipUnderTest } from "./ship/ship-harness.ts";
import { specUnderTest } from "./spec/spec-harness.ts";

const realStages = Effect.fnUntraced(function* () {
  const review = yield* reviewUnderTest.scripted(reviewUnderTest.passing());
  return {
    review,
    stages: {
      intake: (yield* intakeUnderTest.scripted(intakeUnderTest.passing())).stage,
      spec: (yield* specUnderTest.scripted(specUnderTest.passing())).stage,
      provision: (yield* provisionUnderTest.scripted(provisionUnderTest.passing())).stage,
      reproduce: (yield* reproduceUnderTest.scripted(reproduceUnderTest.passing())).stage,
      plan: (yield* planUnderTest.scripted(planUnderTest.passing())).stage,
      build: (yield* buildUnderTest.scripted(buildUnderTest.passing())).stage,
      demo: (yield* demoUnderTest.scripted(demoUnderTest.passing())).stage,
      review: review.stage,
      ship: (yield* shipUnderTest.scripted(shipUnderTest.passing())).stage,
    },
  };
});

describe("the default lifecycle with every real stage", () => {
  it.effect("carries a bug with a demo from Intake to shipped", () =>
    Effect.gen(function* () {
      const { review, stages } = yield* realStages();
      const workItem = yield* startWorkItem({ stages });
      yield* workItem.reaches("specGate");
      workItem.send({ type: "approve", ...reviewer });
      yield* workItem.reaches("shipGate");
      expect(review.fake.tasks()).toStrictEqual([
        {
          ...firstReview,
          kind: "bug",
          reproductionRef: captured.reproductionRef,
          demoRef: firstDemoMade.demoRef,
        },
      ]);
      workItem.send({ type: "approve", ...reviewer });
      yield* workItem.reaches("shipped");
      expect(workItem.context().facts).toMatchObject(delivered);
    }),
  );
});

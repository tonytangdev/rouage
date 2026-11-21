import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { reviewer } from "../lifecycle/golden-route.ts";
import { startWorkItem } from "../lifecycle/lifecycle-harness.ts";
import { firstDemoMade } from "./demo/demo-harness.ts";
import { realStages } from "./real-stages.ts";
import { captured } from "./reproduce/reproduce-harness.ts";
import { firstReview } from "./review/review-harness.ts";
import { delivered } from "./ship/ship-harness.ts";

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
      expect(workItem.context().facts).toMatchObject({ deliveryRef: delivered.deliveryRef });
    }),
  );
});

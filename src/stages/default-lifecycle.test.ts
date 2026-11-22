import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { fakeSandboxTeardown } from "../lifecycle/fake-sandbox-teardown.ts";
import { newWorkItem, reviewer } from "../lifecycle/golden-route.ts";
import { createWorkItem } from "../lifecycle/work-item-actor.ts";
import { withDefaultStages } from "./default-stages.ts";
import { firstDemoMade } from "./demo/demo-harness.ts";
import { passingPorts } from "./passing-ports.ts";
import { captured } from "./reproduce/reproduce-harness.ts";
import { firstReview } from "./review/review-harness.ts";
import { delivered } from "./ship/ship-harness.ts";

describe("the default lifecycle with every real stage", () => {
  it.effect("carries a bug with a demo from Intake to shipped on the ports it is given", () =>
    Effect.gen(function* () {
      const ports = yield* passingPorts;
      const sandbox = fakeSandboxTeardown();
      const lifecycle = yield* withDefaultStages().pipe(Effect.provide(ports.layer));
      const workItem = yield* createWorkItem(lifecycle, newWorkItem).pipe(
        Effect.provide(sandbox.layer),
      );
      yield* workItem.reaches("specGate");
      workItem.send({ type: "approve", ...reviewer });
      yield* workItem.reaches("shipGate");
      expect(ports.review.tasks()).toStrictEqual([
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
      yield* workItem.tornDown;
      expect(sandbox.completed()).toStrictEqual([{ workItemId: newWorkItem.id }]);
    }),
  );
});

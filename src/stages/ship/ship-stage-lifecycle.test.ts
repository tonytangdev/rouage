import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { goldenRefs } from "../../lifecycle/golden-route.ts";
import { startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { firstShipment, shipUnderTest } from "./ship-harness.ts";

describe("a work item in the Ship stage", () => {
  it.effect("keeps where its change was delivered once shipped", () =>
    Effect.gen(function* () {
      const { stage } = yield* shipUnderTest.scripted({ deliveries: [{ deliveryRef: "pr-7" }] });
      const workItem = yield* startWorkItem({ stages: { ship: stage } });
      workItem.advanceTo("ship");
      yield* workItem.reaches("shipped");
      expect(workItem.context().facts).toMatchObject({ deliveryRef: "pr-7" });
    }),
  );

  it.effect("shows the shipper the reproduction and demo a bug gathered on its way", () =>
    Effect.gen(function* () {
      const { fake, stage } = yield* shipUnderTest.scripted(shipUnderTest.passing());
      const workItem = yield* startWorkItem({ stages: { ship: stage } });
      workItem.advanceTo("ship", { kind: "bug", demo: true });
      yield* workItem.reaches("shipped");
      expect(fake.tasks()).toStrictEqual([
        {
          ...firstShipment,
          kind: "bug",
          reproductionRef: goldenRefs.reproductionRef,
          demoRef: goldenRefs.demoRef,
        },
      ]);
    }),
  );
});

describePortStageInLifecycle(shipUnderTest);

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { delivered, firstShipment, shipUnderTest } from "./ship-harness.ts";

describe("ship stage", () => {
  it.effect("hides a demo the latest plan no longer calls for", () =>
    Effect.gen(function* () {
      const { fake } = yield* shipUnderTest.run(
        { deliveries: [delivered] },
        { ...shipUnderTest.input, demoPlanned: false, demoRef: "demo-1" },
      );
      expect(fake.tasks()).toStrictEqual([firstShipment]);
    }),
  );

  it.effect("fails without asking the shipper when there is no sandbox", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* shipUnderTest.run(
        { deliveries: [delivered] },
        { ...shipUnderTest.input, sandboxRef: null },
      );
      expect(failureReasonOf(settled.error).tag).toStrictEqual("SandboxMissing");
      expect(fake.tasks()).toStrictEqual([]);
    }),
  );
});

describePortStage(shipUnderTest);

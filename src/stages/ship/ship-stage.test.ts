import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { delivered, shipUnderTest } from "./ship-harness.ts";

describe("ship stage", () => {
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

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { delivered, needsRebuild, shipUnderTest } from "./ship-harness.ts";

describe("ship stage", () => {
  it.effect("finishes needing a rebuild, with what kept the change from landing", () =>
    Effect.gen(function* () {
      const { settled } = yield* shipUnderTest.run({ shipments: [needsRebuild] });
      expect(settled.output).toStrictEqual(needsRebuild);
    }),
  );

  it.effect("fails without asking the shipper when there is no sandbox", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* shipUnderTest.run(
        { shipments: [delivered] },
        { ...shipUnderTest.input, sandboxRef: null },
      );
      expect(failureReasonOf(settled.error).tag).toStrictEqual("SandboxMissing");
      expect(fake.tasks()).toStrictEqual([]);
    }),
  );
});

describePortStage(shipUnderTest);

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { shipUnderTest } from "./ship-harness.ts";

describe("a work item in the Ship stage", () => {
  it.effect("keeps where its change was delivered once shipped", () =>
    Effect.gen(function* () {
      const { stage } = yield* shipUnderTest.scripted({ deliveries: [{ deliveryRef: "pr-7" }] });
      const workItem = yield* startWorkItem({ ship: stage });
      workItem.advanceTo("ship");
      yield* workItem.reaches("shipped");
      expect(workItem.context().facts).toMatchObject({ deliveryRef: "pr-7" });
    }),
  );
});

describePortStageInLifecycle(shipUnderTest);

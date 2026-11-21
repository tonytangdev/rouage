import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { demoUnderTest, firstDemo, firstDemoMade } from "./demo-harness.ts";

describe("demo stage", () => {
  it.effect("revises the previous demo, given the bug's reproduction", () =>
    Effect.gen(function* () {
      const { fake } = yield* demoUnderTest.run(
        { demos: [{ demoRef: "demo-2" }] },
        { ...demoUnderTest.input, kind: "bug", reproductionRef: "repro-1", demoRef: "demo-1" },
      );
      expect(fake.tasks()).toStrictEqual([
        { ...firstDemo, kind: "bug", reproductionRef: "repro-1", previousDemoRef: "demo-1" },
      ]);
    }),
  );

  it.effect("fails without asking the demonstrator when there is no sandbox", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* demoUnderTest.run(
        { demos: [firstDemoMade] },
        { ...demoUnderTest.input, sandboxRef: null },
      );
      expect(failureReasonOf(settled.error).tag).toStrictEqual("SandboxMissing");
      expect(fake.tasks()).toStrictEqual([]);
    }),
  );
});

describePortStage(demoUnderTest);

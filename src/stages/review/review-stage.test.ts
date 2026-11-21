import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { approval, changesRequested, firstReview, reviewUnderTest } from "./review-harness.ts";

describe("review stage", () => {
  it.effect("shows the reviewer the bug's reproduction and the planned demo", () =>
    Effect.gen(function* () {
      const { fake } = yield* reviewUnderTest.run(
        { verdicts: [approval] },
        {
          ...reviewUnderTest.input,
          kind: "bug",
          reproductionRef: "repro-1",
          demoPlanned: true,
          demoRef: "demo-1",
        },
      );
      expect(fake.tasks()).toStrictEqual([
        { ...firstReview, kind: "bug", reproductionRef: "repro-1", demoRef: "demo-1" },
      ]);
    }),
  );

  it.effect("hides a demo the latest plan no longer calls for", () =>
    Effect.gen(function* () {
      const { fake } = yield* reviewUnderTest.run(
        { verdicts: [approval] },
        { ...reviewUnderTest.input, demoPlanned: false, demoRef: "demo-1" },
      );
      expect(fake.tasks()).toStrictEqual([firstReview]);
    }),
  );

  it.effect("finishes with the changes the reviewer requests", () =>
    Effect.gen(function* () {
      const { settled } = yield* reviewUnderTest.run({ verdicts: [changesRequested] });
      expect(settled.output).toStrictEqual(changesRequested);
    }),
  );

  it.effect("fails without asking the reviewer when there is no sandbox", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* reviewUnderTest.run(
        { verdicts: [approval] },
        { ...reviewUnderTest.input, sandboxRef: null },
      );
      expect(failureReasonOf(settled.error).tag).toStrictEqual("SandboxMissing");
      expect(fake.tasks()).toStrictEqual([]);
    }),
  );
});

describePortStage(reviewUnderTest);

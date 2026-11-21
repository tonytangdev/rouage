import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { approval, changesRequested, reviewUnderTest } from "./review-harness.ts";

describe("review stage", () => {
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

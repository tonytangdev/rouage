import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { intakeUnderTest, isFeature, isUnclear } from "./intake-harness.ts";

describe("intake stage", () => {
  it.effect("classifies the work item as a feature when the classifier finds a feature", () =>
    Effect.gen(function* () {
      const { settled } = yield* intakeUnderTest.run({ results: [isFeature] });
      expect(settled.output).toStrictEqual({ _tag: "classified", kind: "feature" });
    }),
  );

  it.effect("fails as Unclassifiable when the classifier cannot tell", () =>
    Effect.gen(function* () {
      const { settled } = yield* intakeUnderTest.run({ results: [isUnclear] });
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "Unclassifiable",
        message: "The issue asks for a change without saying what is wrong today",
      });
    }),
  );
});

describePortStage(intakeUnderTest);

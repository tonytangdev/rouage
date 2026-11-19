import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { isBug, isFeature, isUnclear, runIntake } from "./intake-harness.ts";
import { failureReasonOf } from "./stage.ts";

describe("intake stage", () => {
  it.effect("classifies the work item as a bug when the classifier finds a bug", () =>
    Effect.gen(function* () {
      const { settled } = yield* runIntake({ results: [isBug] });
      expect(settled.output).toStrictEqual({ _tag: "classified", kind: "bug" });
    }),
  );

  it.effect("classifies the work item as a feature when the classifier finds a feature", () =>
    Effect.gen(function* () {
      const { settled } = yield* runIntake({ results: [isFeature] });
      expect(settled.output).toStrictEqual({ _tag: "classified", kind: "feature" });
    }),
  );

  it.effect("asks the classifier about the work item's issue", () =>
    Effect.gen(function* () {
      const { calls } = yield* runIntake({ results: [isBug] });
      expect(calls).toStrictEqual([{ workItemId: "wi-1", issueRef: "#1", feedback: null }]);
    }),
  );

  it.effect("fails as Unclassifiable when the classifier cannot tell", () =>
    Effect.gen(function* () {
      const { settled } = yield* runIntake({ results: [isUnclear] });
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "Unclassifiable",
        message: "The issue asks for a change without saying what is wrong today",
      });
    }),
  );
});

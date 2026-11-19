import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { describeStageContract } from "../../lifecycle/stage-contract.ts";
import { failureReasonOf } from "../../lifecycle/stage.ts";
import { portAdapter } from "../port-stage-contract.ts";
import { isBug, isFeature, isUnclear, runIntake } from "./intake-harness.ts";

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

describeStageContract(
  portAdapter({
    name: "intake",
    port: "classifier",
    gaveUpTag: "ClassifierGaveUp",
    firstStep: "classify",
    outcome: { _tag: "classified", kind: "bug" },
    run: (misbehaving) => runIntake({ results: [isBug], misbehaving }),
  }),
);

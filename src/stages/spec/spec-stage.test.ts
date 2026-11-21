import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { firstWrite, specUnderTest, unclearIssue, writtenSpec } from "./spec-harness.ts";

describe("spec stage", () => {
  it.effect("asks the writer to revise the previous spec with the human's feedback", () =>
    Effect.gen(function* () {
      const { fake } = yield* specUnderTest.run(
        { results: [writtenSpec] },
        { ...specUnderTest.input, feedback: "Cover the empty cart", specRef: "spec-0" },
      );
      expect(fake.tasks()).toStrictEqual([
        { ...firstWrite, feedback: "Cover the empty cart", previousSpecRef: "spec-0" },
      ]);
    }),
  );

  it.effect("fails as Unspecifiable when the writer finds the issue unclear", () =>
    Effect.gen(function* () {
      const { settled } = yield* specUnderTest.run({ results: [unclearIssue] });
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "Unspecifiable",
        message: "The issue names the page but not what it should show",
      });
    }),
  );

  it.effect("fails as Unclassified without asking the writer when the work item has no kind", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* specUnderTest.run(
        { results: [writtenSpec] },
        { ...specUnderTest.input, kind: null },
      );
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "Unclassified",
        message: "Spec needs a work item classified as a bug or a feature",
      });
      expect(fake.tasks()).toStrictEqual([]);
    }),
  );
});

describePortStage(specUnderTest);

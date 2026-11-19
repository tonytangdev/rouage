import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { describeStageContract } from "../../lifecycle/stage-contract.ts";
import { failureReasonOf } from "../../lifecycle/stage.ts";
import { portAdapter } from "../port-stage-contract.ts";
import { specWriterPort } from "./fake-spec-writer.ts";
import { classifiedInput, firstWrite, runSpec, unclearIssue, writtenSpec } from "./spec-harness.ts";

describe("spec stage", () => {
  it.effect("finishes with the reference to the spec the writer wrote", () =>
    Effect.gen(function* () {
      const { settled } = yield* runSpec({ results: [writtenSpec] });
      expect(settled.output).toStrictEqual({ _tag: "written", specRef: "spec-1" });
    }),
  );

  it.effect("asks the writer to revise the previous spec with the human's feedback", () =>
    Effect.gen(function* () {
      const { calls } = yield* runSpec(
        { results: [writtenSpec] },
        { ...classifiedInput, feedback: "Cover the empty cart", specRef: "spec-0" },
      );
      expect(calls).toStrictEqual([
        { ...firstWrite, feedback: "Cover the empty cart", previousSpecRef: "spec-0" },
      ]);
    }),
  );

  it.effect("fails as Unspecifiable when the writer finds the issue unclear", () =>
    Effect.gen(function* () {
      const { settled } = yield* runSpec({ results: [unclearIssue] });
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "Unspecifiable",
        message: "The issue names the page but not what it should show",
      });
    }),
  );

  it.effect("fails as Unclassified without asking the writer when the work item has no kind", () =>
    Effect.gen(function* () {
      const { settled, calls } = yield* runSpec(
        { results: [writtenSpec] },
        { ...classifiedInput, kind: null },
      );
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "Unclassified",
        message: "Spec needs a work item classified as a bug or a feature",
      });
      expect(calls).toStrictEqual([]);
    }),
  );
});

describeStageContract(
  portAdapter({
    name: "spec",
    port: specWriterPort,
    outcome: { _tag: "written", specRef: "spec-1" },
    run: (misbehaving) => runSpec({ results: [writtenSpec], misbehaving }),
  }),
);

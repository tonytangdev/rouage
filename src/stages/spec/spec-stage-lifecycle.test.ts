import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { reviewer, startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { specWriterPort } from "./fake-spec-writer.ts";
import { firstWrite, scriptedSpec, unclearIssue, writtenSpec } from "./spec-harness.ts";

const revisedSpec = { _tag: "written", specRef: "spec-2" } as const;

describe("a work item in the Spec stage", () => {
  it.effect("waits at the spec gate holding the reference to the written spec", () =>
    Effect.gen(function* () {
      const { spec } = yield* scriptedSpec({ results: [writtenSpec] });
      const workItem = yield* startWorkItem({ spec });
      workItem.advanceTo("spec", { kind: "bug" });
      yield* workItem.reaches("specGate");
      expect(workItem.context().facts.specRef).toStrictEqual("spec-1");
    }),
  );

  it.effect("revises the spec with the reviewer's comment once the spec gate rejects it", () =>
    Effect.gen(function* () {
      const { specWriter, spec } = yield* scriptedSpec({ results: [writtenSpec, revisedSpec] });
      const workItem = yield* startWorkItem({ spec });
      workItem.advanceTo("spec", { kind: "bug" });
      yield* workItem.reaches("specGate");
      workItem.send({ type: "reject", ...reviewer, comment: "Cover the empty cart" });
      yield* workItem.reaches("specGate");
      expect(workItem.context().facts.specRef).toStrictEqual("spec-2");
      expect(specWriter.tasks()).toStrictEqual([
        firstWrite,
        { ...firstWrite, feedback: "Cover the empty cart", previousSpecRef: "spec-1" },
      ]);
    }),
  );

  it.effect("writes again with the human's comment once sent back from blocked", () =>
    Effect.gen(function* () {
      const { specWriter, spec } = yield* scriptedSpec({ results: [unclearIssue, writtenSpec] });
      const workItem = yield* startWorkItem({ spec });
      workItem.advanceTo("spec", { kind: "bug" });
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "spec",
        reason: { tag: "Unspecifiable", message: unclearIssue.reason },
      });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "It should list the open orders" });
      yield* workItem.reaches("specGate");
      expect(specWriter.tasks()).toStrictEqual([
        firstWrite,
        { ...firstWrite, feedback: "It should list the open orders" },
      ]);
    }),
  );

  it.effect("revises the approved spec once a later stage's block sends it back to Spec", () =>
    Effect.gen(function* () {
      const { specWriter, spec } = yield* scriptedSpec({ results: [writtenSpec, revisedSpec] });
      const workItem = yield* startWorkItem({ spec });
      workItem.advanceTo("spec", { kind: "bug" });
      yield* workItem.reaches("specGate");
      workItem.send({ type: "approve", ...reviewer });
      workItem.finish("provision", { _tag: "provisioned", sandboxRef: "box-1", sampleRef: null });
      workItem.finish("reproduce", { _tag: "cannotReproduce", reason: "works on staging" });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "Name the browser" });
      yield* workItem.reaches("specGate");
      expect(specWriter.tasks().at(-1)).toStrictEqual({
        ...firstWrite,
        feedback: "Name the browser",
        previousSpecRef: "spec-1",
      });
    }),
  );
});

describePortStageInLifecycle({
  name: "spec",
  port: specWriterPort,
  scripted: (misbehaving) =>
    Effect.map(scriptedSpec({ results: [writtenSpec], misbehaving }), ({ specWriter, spec }) => ({
      fake: specWriter,
      stage: spec,
    })),
  route: { kind: "bug" },
  next: "specGate",
  firstTask: firstWrite,
});

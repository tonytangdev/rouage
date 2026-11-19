import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { restoredWorkItem, startWorkItem, throughJson } from "../../lifecycle/lifecycle-harness.ts";
import { scriptedSpec, unclearIssue, writtenSpec } from "./spec-harness.ts";

type DrivenWorkItem = Effect.Success<ReturnType<typeof startWorkItem>>;

const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" };

const revisedSpec = { _tag: "written", specRef: "spec-2" } as const;

const firstWrite = {
  workItemId: "wi-1",
  issueRef: "#1",
  kind: "bug",
  feedback: null,
  previous: null,
} as const;

const classifyAsBug = (workItem: DrivenWorkItem) => {
  workItem.finish("intake", { _tag: "classified", kind: "bug" });
};

describe("a work item in the Spec stage", () => {
  it.effect("waits at the spec gate holding the reference to the written spec", () =>
    Effect.gen(function* () {
      const { spec } = yield* scriptedSpec({ results: [writtenSpec] });
      const workItem = yield* startWorkItem({ spec });
      classifyAsBug(workItem);
      yield* workItem.reaches("specGate");
      expect(workItem.context().spec).toStrictEqual("spec-1");
    }),
  );

  it.effect("revises the spec with the reviewer's comment once the spec gate rejects it", () =>
    Effect.gen(function* () {
      const { specWriter, spec } = yield* scriptedSpec({ results: [writtenSpec, revisedSpec] });
      const workItem = yield* startWorkItem({ spec });
      classifyAsBug(workItem);
      yield* workItem.reaches("specGate");
      workItem.send({ type: "reject", ...reviewer, comment: "Cover the empty cart" });
      yield* workItem.reaches("specGate");
      expect(workItem.context().spec).toStrictEqual("spec-2");
      expect(specWriter.calls()).toStrictEqual([
        firstWrite,
        { ...firstWrite, feedback: "Cover the empty cart", previous: "spec-1" },
      ]);
    }),
  );

  it.effect("writes again with the human's comment once sent back from blocked", () =>
    Effect.gen(function* () {
      const { specWriter, spec } = yield* scriptedSpec({ results: [unclearIssue, writtenSpec] });
      const workItem = yield* startWorkItem({ spec });
      classifyAsBug(workItem);
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "spec",
        reason: { tag: "Unspecifiable", message: unclearIssue.reason },
      });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "It should list the open orders" });
      yield* workItem.reaches("specGate");
      expect(specWriter.calls()).toStrictEqual([
        firstWrite,
        { ...firstWrite, feedback: "It should list the open orders" },
      ]);
    }),
  );

  it.effect("writes again when restored mid-write", () =>
    Effect.gen(function* () {
      const before = yield* scriptedSpec({
        results: [],
        misbehaving: { step: "write", as: "hanging" },
      });
      const original = yield* startWorkItem({ spec: before.spec });
      classifyAsBug(original);
      yield* before.specWriter.started("write");
      const after = yield* scriptedSpec({ results: [writtenSpec] });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), { spec: after.spec });
      yield* workItem.reaches("specGate");
      expect(after.specWriter.calls()).toStrictEqual([firstWrite]);
    }),
  );
});

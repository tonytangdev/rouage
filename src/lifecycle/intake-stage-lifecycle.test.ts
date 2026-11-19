import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { isBug, isUnclear, scriptedIntake } from "./intake-harness.ts";
import { restoredWorkItem, startWorkItem, throughJson } from "./lifecycle-harness.ts";

const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" };

describe("a work item in the Intake stage", () => {
  it.effect("moves on to Spec with the kind Intake classified it as", () =>
    Effect.gen(function* () {
      const { intake } = yield* scriptedIntake({ results: [isBug] });
      const workItem = yield* startWorkItem({ intake });
      yield* workItem.reaches("spec");
      expect(workItem.context().kind).toStrictEqual("bug");
    }),
  );

  it.effect("classifies again with the human's comment once sent back from blocked", () =>
    Effect.gen(function* () {
      const { classifier, intake } = yield* scriptedIntake({ results: [isUnclear, isBug] });
      const workItem = yield* startWorkItem({ intake });
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "intake",
        reason: { tag: "Unclassifiable", message: isUnclear.reason },
      });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "It is a bug: totals skip VAT" });
      yield* workItem.reaches("spec");
      expect(classifier.calls()).toStrictEqual([
        { workItemId: "wi-1", issueRef: "#1", feedback: null },
        { workItemId: "wi-1", issueRef: "#1", feedback: "It is a bug: totals skip VAT" },
      ]);
    }),
  );

  it.effect("classifies again when restored mid-classification", () =>
    Effect.gen(function* () {
      const before = yield* scriptedIntake({ results: [], misbehaving: "hanging" });
      const original = yield* startWorkItem({ intake: before.intake });
      yield* before.classifier.started;
      const after = yield* scriptedIntake({ results: [isBug] });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        intake: after.intake,
      });
      yield* workItem.reaches("spec");
      expect(after.classifier.calls()).toStrictEqual([
        { workItemId: "wi-1", issueRef: "#1", feedback: null },
      ]);
    }),
  );
});

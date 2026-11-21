import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { reviewer, startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { firstClassify, intakeUnderTest, isBug, isUnclear } from "./intake-harness.ts";

describe("a work item in the Intake stage", () => {
  it.effect("moves on to Spec with the kind Intake classified it as", () =>
    Effect.gen(function* () {
      const { stage } = yield* intakeUnderTest.scripted({ results: [isBug] });
      const workItem = yield* startWorkItem({ intake: stage });
      yield* workItem.reaches("spec");
      expect(workItem.context().facts.kind).toStrictEqual("bug");
    }),
  );

  it.effect("classifies again with the human's comment once sent back from blocked", () =>
    Effect.gen(function* () {
      const { fake, stage } = yield* intakeUnderTest.scripted({ results: [isUnclear, isBug] });
      const workItem = yield* startWorkItem({ intake: stage });
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "intake",
        reason: { tag: "Unclassifiable", message: isUnclear.reason },
      });
      workItem.send({ type: "backToSpec", ...reviewer, comment: "It is a bug: totals skip VAT" });
      yield* workItem.reaches("spec");
      expect(fake.tasks()).toStrictEqual([
        firstClassify,
        { ...firstClassify, feedback: "It is a bug: totals skip VAT" },
      ]);
    }),
  );
});

describePortStageInLifecycle(intakeUnderTest);

import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { reviewer, startWorkItem } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { classifierPort } from "./fake-classifier.ts";
import { isBug, isUnclear, scriptedIntake } from "./intake-harness.ts";

describe("a work item in the Intake stage", () => {
  it.effect("moves on to Spec with the kind Intake classified it as", () =>
    Effect.gen(function* () {
      const { intake } = yield* scriptedIntake({ results: [isBug] });
      const workItem = yield* startWorkItem({ intake });
      yield* workItem.reaches("spec");
      expect(workItem.context().facts.kind).toStrictEqual("bug");
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
      expect(classifier.tasks()).toStrictEqual([
        { workItemId: "wi-1", issueRef: "#1", feedback: null },
        { workItemId: "wi-1", issueRef: "#1", feedback: "It is a bug: totals skip VAT" },
      ]);
    }),
  );
});

describePortStageInLifecycle({
  name: "intake",
  port: classifierPort,
  scripted: (misbehaving) =>
    Effect.map(scriptedIntake({ results: [isBug], misbehaving }), ({ classifier, intake }) => ({
      fake: classifier,
      stage: intake,
    })),
  next: "spec",
  firstTask: { workItemId: "wi-1", issueRef: "#1", feedback: null },
});

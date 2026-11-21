import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { restoredWorkItem, startWorkItem, throughJson } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import {
  captured,
  checkFailed,
  checkPassed,
  firstCapture,
  firstConfirm,
  reproduceUnderTest,
} from "./reproduce-harness.ts";

const needsSample = { _tag: "needsSample", sampleRequest: "orders over 100" } as const;

describe("a work item in the Reproduce stage", () => {
  it.effect("goes on to Plan holding the reference to the bug's reproduction", () =>
    Effect.gen(function* () {
      const { stage } = yield* reproduceUnderTest.scripted({
        captures: [captured],
        confirmations: [checkFailed],
      });
      const workItem = yield* startWorkItem({ reproduce: stage });
      workItem.advanceTo("reproduce", { kind: "bug" });
      yield* workItem.reaches("plan");
      expect(workItem.context().facts.reproductionRef).toStrictEqual("repro-1");
    }),
  );

  it.effect("becomes blocked on Reproduce when the captured check passes", () =>
    Effect.gen(function* () {
      const { stage } = yield* reproduceUnderTest.scripted({
        captures: [captured],
        confirmations: [checkPassed],
      });
      const workItem = yield* startWorkItem({ reproduce: stage });
      workItem.advanceTo("reproduce", { kind: "bug" });
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toMatchObject({
        from: "reproduce",
        reason: { tag: "ReproductionDidNotFail" },
      });
    }),
  );

  it.effect("captures again with the sample Provision took for its request", () =>
    Effect.gen(function* () {
      const { fake, stage } = yield* reproduceUnderTest.scripted({
        captures: [needsSample, captured],
        confirmations: [checkFailed],
      });
      const workItem = yield* startWorkItem({ reproduce: stage });
      workItem.advanceTo("reproduce", { kind: "bug" });
      yield* workItem.reaches("provision");
      workItem.finish("provision", {
        _tag: "provisioned",
        sandboxRef: "box-1",
        sampleRef: "sample-1",
      });
      yield* workItem.reaches("plan");
      expect(fake.calls().filter((call) => call.step === "capture")).toStrictEqual([
        { step: "capture", task: firstCapture },
        {
          step: "capture",
          task: { ...firstCapture, sampleRequest: "orders over 100", sampleRef: "sample-1" },
        },
      ]);
    }),
  );

  it.effect(
    "confirms the captured reproduction without capturing again when restored mid-confirm",
    () =>
      Effect.gen(function* () {
        const before = yield* reproduceUnderTest.scripted({
          captures: [captured],
          misbehaving: { step: "confirm", as: "hanging" },
        });
        const original = yield* startWorkItem({ reproduce: before.stage });
        original.advanceTo("reproduce", { kind: "bug" });
        yield* before.fake.started("confirm");
        const after = yield* reproduceUnderTest.scripted({
          captures: [],
          confirmations: [checkFailed],
        });
        const workItem = yield* restoredWorkItem(throughJson(original.save()), {
          reproduce: after.stage,
        });
        yield* workItem.reaches("plan");
        expect(after.fake.calls()).toStrictEqual([{ step: "confirm", task: firstConfirm }]);
        expect(workItem.context().facts.reproductionRef).toStrictEqual("repro-1");
      }),
  );
});

describePortStageInLifecycle(reproduceUnderTest);

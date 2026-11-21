import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { restoredWorkItem, startWorkItem, throughJson } from "../../lifecycle/lifecycle-harness.ts";
import {
  captured,
  checkFailed,
  checkPassed,
  firstCapture,
  firstConfirm,
  scriptedReproduce,
} from "./reproduce-harness.ts";

const needsSample = { _tag: "needsSample", sampleRequest: "orders over 100" } as const;

describe("a work item in the Reproduce stage", () => {
  it.effect("goes on to Plan holding the reference to the bug's reproduction", () =>
    Effect.gen(function* () {
      const { reproduce } = yield* scriptedReproduce({
        captures: [captured],
        confirmations: [checkFailed],
      });
      const workItem = yield* startWorkItem({ reproduce });
      workItem.advanceTo("reproduce", { kind: "bug" });
      yield* workItem.reaches("plan");
      expect(workItem.context().reproductionRef).toStrictEqual("repro-1");
    }),
  );

  it.effect("becomes blocked on Reproduce when the captured check passes", () =>
    Effect.gen(function* () {
      const { reproduce } = yield* scriptedReproduce({
        captures: [captured],
        confirmations: [checkPassed],
      });
      const workItem = yield* startWorkItem({ reproduce });
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
      const { reproducer, reproduce } = yield* scriptedReproduce({
        captures: [needsSample, captured],
        confirmations: [checkFailed],
      });
      const workItem = yield* startWorkItem({ reproduce });
      workItem.advanceTo("reproduce", { kind: "bug" });
      yield* workItem.reaches("provision");
      workItem.finish("provision", {
        _tag: "provisioned",
        sandboxRef: "box-1",
        sampleRef: "sample-1",
      });
      yield* workItem.reaches("plan");
      expect(reproducer.calls().filter((call) => call.step === "capture")).toStrictEqual([
        { step: "capture", task: firstCapture },
        {
          step: "capture",
          task: { ...firstCapture, sampleRequest: "orders over 100", sampleRef: "sample-1" },
        },
      ]);
    }),
  );

  it.effect("captures again when restored mid-capture", () =>
    Effect.gen(function* () {
      const before = yield* scriptedReproduce({
        captures: [],
        misbehaving: { step: "capture", as: "hanging" },
      });
      const original = yield* startWorkItem({ reproduce: before.reproduce });
      original.advanceTo("reproduce", { kind: "bug" });
      yield* before.reproducer.started("capture");
      const after = yield* scriptedReproduce({
        captures: [captured],
        confirmations: [checkFailed],
      });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        reproduce: after.reproduce,
      });
      yield* workItem.reaches("plan");
      expect(after.reproducer.calls()).toStrictEqual([
        { step: "capture", task: firstCapture },
        { step: "confirm", task: firstConfirm },
      ]);
    }),
  );

  it.effect(
    "confirms the captured reproduction without capturing again when restored mid-confirm",
    () =>
      Effect.gen(function* () {
        const before = yield* scriptedReproduce({
          captures: [captured],
          misbehaving: { step: "confirm", as: "hanging" },
        });
        const original = yield* startWorkItem({ reproduce: before.reproduce });
        original.advanceTo("reproduce", { kind: "bug" });
        yield* before.reproducer.started("confirm");
        const after = yield* scriptedReproduce({ captures: [], confirmations: [checkFailed] });
        const workItem = yield* restoredWorkItem(throughJson(original.save()), {
          reproduce: after.reproduce,
        });
        yield* workItem.reaches("plan");
        expect(after.reproducer.calls()).toStrictEqual([{ step: "confirm", task: firstConfirm }]);
        expect(workItem.context().reproductionRef).toStrictEqual("repro-1");
      }),
  );
});

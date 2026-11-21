import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { restoredWorkItem, startWorkItem, throughJson } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import {
  buildUnderTest,
  firstImplement,
  reproductionPassed,
  testsFailed,
  testsPassed,
} from "./build-harness.ts";

describe("a work item in the Build stage", () => {
  it.effect("moves on to Review once Build's tests pass", () =>
    Effect.gen(function* () {
      const { stage } = yield* buildUnderTest.scripted({ testReports: [testsFailed, testsPassed] });
      const workItem = yield* startWorkItem({ stages: { build: stage } });
      workItem.advanceTo("build");
      yield* workItem.reaches("review");
      expect(workItem.context().blocked).toBeNull();
    }),
  );

  it.effect("resumes Build at the step it was saved in", () =>
    Effect.gen(function* () {
      const before = yield* buildUnderTest.scripted({
        testReports: [],
        misbehaving: { step: "test", as: "hanging" },
      });
      const original = yield* startWorkItem({ stages: { build: before.stage } });
      original.advanceTo("build");
      yield* before.fake.started("test");
      const after = yield* buildUnderTest.scripted({ testReports: [testsFailed, testsPassed] });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        stages: { build: after.stage },
      });
      yield* workItem.reaches("review");
      expect(after.fake.steps()).toStrictEqual(["test", "fix", "test"]);
    }),
  );

  it.effect("runs a bug's reproduction check again when restored mid-check", () =>
    Effect.gen(function* () {
      const before = yield* buildUnderTest.scripted({
        testReports: [testsPassed],
        misbehaving: { step: "checkReproduction", as: "hanging" },
      });
      const original = yield* startWorkItem({ stages: { build: before.stage } });
      original.advanceTo("build", { kind: "bug" });
      yield* before.fake.started("checkReproduction");
      const after = yield* buildUnderTest.scripted({
        testReports: [],
        reproductionChecks: [reproductionPassed],
      });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        stages: { build: after.stage },
      });
      yield* workItem.reaches("review");
      expect(after.fake.steps()).toStrictEqual(["checkReproduction"]);
    }),
  );

  it.effect("keeps the fix attempts a Build started with when it is restored mid-fix", () =>
    Effect.gen(function* () {
      const before = yield* buildUnderTest.scripted({
        testReports: [testsFailed],
        misbehaving: { step: "fix", as: "hanging" },
        fixAttempts: 1,
      });
      const original = yield* startWorkItem({ stages: { build: before.stage } });
      original.advanceTo("build");
      yield* before.fake.started("fix");
      const after = yield* buildUnderTest.scripted({ testReports: [testsFailed], fixAttempts: 3 });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        stages: { build: after.stage },
      });
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked?.reason.tag).toStrictEqual("FixAttemptsExhausted");
      expect(after.fake.steps()).toStrictEqual(["fix", "test"]);
    }),
  );

  it.effect(
    "builds again, following the same plan, with the reviewer's feedback when Review requests changes",
    () =>
      Effect.gen(function* () {
        const { fake, stage } = yield* buildUnderTest.scripted({
          testReports: [testsPassed, testsPassed],
        });
        const workItem = yield* startWorkItem({ stages: { build: stage } });
        workItem.advanceTo("build");
        yield* workItem.reaches("review");
        workItem.finish("review", { _tag: "changesRequested", feedback: "rename totals" });
        yield* workItem.reaches("review");
        expect(fake.calls().filter((call) => call.step === "implement")).toStrictEqual([
          { step: "implement", task: firstImplement },
          {
            step: "implement",
            task: {
              ...firstImplement,
              feedback: "rename totals",
              changeRequest: { from: "review", text: "rename totals" },
            },
          },
        ]);
      }),
  );
});

describePortStageInLifecycle(buildUnderTest);

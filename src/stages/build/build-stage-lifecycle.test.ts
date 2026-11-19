import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { restoredWorkItem, startWorkItem, throughJson } from "../../lifecycle/lifecycle-harness.ts";
import { scriptedBuild, testsFailed, testsPassed } from "./build-harness.ts";

type DrivenWorkItem = Effect.Success<ReturnType<typeof startWorkItem>>;

const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" };

const throughPlan = (workItem: DrivenWorkItem) => {
  workItem.finish("intake", { _tag: "classified", kind: "feature" });
  workItem.finish("spec", { _tag: "written", specRef: "spec-1" });
  workItem.send({ type: "approve", ...reviewer });
  workItem.finish("provision", { _tag: "provisioned" });
  workItem.finish("plan", { _tag: "planned", demo: false });
};

describe("a work item in the Build stage", () => {
  it.effect("moves on to Review once Build's tests pass", () =>
    Effect.gen(function* () {
      const { build } = yield* scriptedBuild({ testReports: [testsFailed, testsPassed] });
      const workItem = yield* startWorkItem({ build });
      throughPlan(workItem);
      yield* workItem.reaches("review");
      expect(workItem.context().blocked).toBeNull();
    }),
  );

  it.effect("becomes blocked on Build when Build fails", () =>
    Effect.gen(function* () {
      const { build } = yield* scriptedBuild({
        testReports: [testsPassed],
        misbehaving: { step: "implement", as: "failing" },
      });
      const workItem = yield* startWorkItem({ build });
      throughPlan(workItem);
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "build",
        reason: { tag: "BuilderGaveUp", message: "The builder gave up during implement" },
      });
    }),
  );

  it.effect("resumes Build at the step it was saved in", () =>
    Effect.gen(function* () {
      const before = yield* scriptedBuild({
        testReports: [],
        misbehaving: { step: "test", as: "hanging" },
      });
      const original = yield* startWorkItem({ build: before.build });
      throughPlan(original);
      yield* before.builder.started("test");
      const after = yield* scriptedBuild({ testReports: [testsFailed, testsPassed] });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        build: after.build,
      });
      yield* workItem.reaches("review");
      expect(after.builder.steps()).toStrictEqual(["test", "fix", "test"]);
    }),
  );

  it.effect("keeps the fix attempts a Build started with when it is restored mid-fix", () =>
    Effect.gen(function* () {
      const before = yield* scriptedBuild(
        { testReports: [testsFailed], misbehaving: { step: "fix", as: "hanging" } },
        { fixAttempts: 1 },
      );
      const original = yield* startWorkItem({ build: before.build });
      throughPlan(original);
      yield* before.builder.started("fix");
      const after = yield* scriptedBuild({ testReports: [testsFailed] }, { fixAttempts: 3 });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        build: after.build,
      });
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked?.reason.tag).toStrictEqual("FixAttemptsExhausted");
      expect(after.builder.steps()).toStrictEqual(["fix", "test"]);
    }),
  );

  it.effect("builds again with the reviewer's feedback when Review requests changes", () =>
    Effect.gen(function* () {
      const { builder, build } = yield* scriptedBuild({ testReports: [testsPassed, testsPassed] });
      const workItem = yield* startWorkItem({ build });
      throughPlan(workItem);
      yield* workItem.reaches("review");
      workItem.finish("review", { _tag: "changesRequested", feedback: "rename totals" });
      yield* workItem.reaches("review");
      expect(builder.calls().filter((call) => call.step === "implement")).toStrictEqual([
        { step: "implement", task: { workItemId: "wi-1", feedback: null } },
        { step: "implement", task: { workItemId: "wi-1", feedback: "rename totals" } },
      ]);
    }),
  );
});

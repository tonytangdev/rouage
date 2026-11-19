import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { scriptedBuild, testsFailed, testsPassed } from "./build-harness.ts";
import { restoredWorkItem, startWorkItem } from "./lifecycle-harness.ts";

type DrivenWorkItem = Effect.Success<ReturnType<typeof startWorkItem>>;

const reviewer = { by: "ada", at: "2026-11-19T10:00:00.000Z" };

const throughJson = (persisted: unknown): unknown => JSON.parse(JSON.stringify(persisted));

const throughPlan = (workItem: DrivenWorkItem) => {
  workItem.finish("intake", { _tag: "classified", kind: "feature" });
  workItem.finish("spec", { _tag: "written" });
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
      const { build } = yield* scriptedBuild({ testReports: [testsPassed], failing: "implement" });
      const workItem = yield* startWorkItem({ build });
      throughPlan(workItem);
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked).toStrictEqual({
        from: "build",
        reason: { tag: "AgentFailed", message: "The agent gave up during implement" },
      });
    }),
  );

  it.effect("resumes Build at the step it was saved in", () =>
    Effect.gen(function* () {
      const before = yield* scriptedBuild({ testReports: [], hanging: "test" });
      const original = yield* startWorkItem({ build: before.build });
      throughPlan(original);
      yield* before.agent.started("test");
      const after = yield* scriptedBuild({ testReports: [testsFailed, testsPassed] });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        build: after.build,
      });
      yield* workItem.reaches("review");
      expect(after.agent.steps()).toStrictEqual(["test", "fix", "test"]);
    }),
  );

  it.effect("keeps the fix attempts a Build started with when it is restored mid-fix", () =>
    Effect.gen(function* () {
      const before = yield* scriptedBuild(
        { testReports: [testsFailed], hanging: "fix" },
        { fixAttempts: 1 },
      );
      const original = yield* startWorkItem({ build: before.build });
      throughPlan(original);
      yield* before.agent.started("fix");
      const after = yield* scriptedBuild({ testReports: [testsFailed] }, { fixAttempts: 3 });
      const workItem = yield* restoredWorkItem(throughJson(original.save()), {
        build: after.build,
      });
      yield* workItem.reaches("blocked");
      expect(workItem.context().blocked?.reason.tag).toStrictEqual("FixAttemptsExhausted");
      expect(after.agent.steps()).toStrictEqual(["fix", "test"]);
    }),
  );

  it.effect("builds again with the reviewer's feedback when Review requests changes", () =>
    Effect.gen(function* () {
      const { agent, build } = yield* scriptedBuild({ testReports: [testsPassed, testsPassed] });
      const workItem = yield* startWorkItem({ build });
      throughPlan(workItem);
      yield* workItem.reaches("review");
      workItem.finish("review", { _tag: "changesRequested", feedback: "rename totals" });
      yield* workItem.reaches("review");
      expect(agent.calls().filter((call) => call.step === "implement")).toStrictEqual([
        { step: "implement", task: { workItemId: "wi-1", feedback: null } },
        { step: "implement", task: { workItemId: "wi-1", feedback: "rename totals" } },
      ]);
    }),
  );
});

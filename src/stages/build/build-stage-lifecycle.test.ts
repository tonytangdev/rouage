import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { restoredWorkItem, startWorkItem, throughJson } from "../../lifecycle/lifecycle-harness.ts";
import { describePortStageInLifecycle } from "../port-stage-lifecycle-contract.ts";
import { scriptedBuild, testsFailed, testsPassed } from "./build-harness.ts";
import { builderPort } from "./fake-builder.ts";

describe("a work item in the Build stage", () => {
  it.effect("moves on to Review once Build's tests pass", () =>
    Effect.gen(function* () {
      const { build } = yield* scriptedBuild({ testReports: [testsFailed, testsPassed] });
      const workItem = yield* startWorkItem({ build });
      workItem.advanceTo("build");
      yield* workItem.reaches("review");
      expect(workItem.context().blocked).toBeNull();
    }),
  );

  it.effect("resumes Build at the step it was saved in", () =>
    Effect.gen(function* () {
      const before = yield* scriptedBuild({
        testReports: [],
        misbehaving: { step: "test", as: "hanging" },
      });
      const original = yield* startWorkItem({ build: before.build });
      original.advanceTo("build");
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
      original.advanceTo("build");
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

  it.effect(
    "builds again, following the same plan, with the reviewer's feedback when Review requests changes",
    () =>
      Effect.gen(function* () {
        const { builder, build } = yield* scriptedBuild({
          testReports: [testsPassed, testsPassed],
        });
        const workItem = yield* startWorkItem({ build });
        workItem.advanceTo("build");
        yield* workItem.reaches("review");
        workItem.finish("review", { _tag: "changesRequested", feedback: "rename totals" });
        yield* workItem.reaches("review");
        expect(builder.calls().filter((call) => call.step === "implement")).toStrictEqual([
          { step: "implement", task: { workItemId: "wi-1", planRef: "plan-1", feedback: null } },
          {
            step: "implement",
            task: { workItemId: "wi-1", planRef: "plan-1", feedback: "rename totals" },
          },
        ]);
      }),
  );
});

describePortStageInLifecycle({
  name: "build",
  port: builderPort,
  scripted: (misbehaving) =>
    Effect.map(
      scriptedBuild({ testReports: [testsPassed], misbehaving }),
      ({ builder, build }) => ({
        fake: builder,
        stage: build,
      }),
    ),
  next: "review",
  firstTask: { workItemId: "wi-1", planRef: "plan-1", feedback: null },
});

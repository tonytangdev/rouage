import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { runBuild, testsFailed, testsPassed } from "./build-harness.ts";
import { failureReasonOf } from "./stage.ts";

describe("build stage", () => {
  it.effect("fixes and tests again until the tests pass", () =>
    Effect.gen(function* () {
      const { snapshot, steps } = yield* runBuild({
        testReports: [testsFailed, testsFailed, testsPassed],
      });
      expect(snapshot.output).toStrictEqual({ _tag: "built" });
      expect(steps).toStrictEqual(["implement", "test", "fix", "test", "fix", "test"]);
    }),
  );

  it.effect("fails with a StageFailure when the tests still fail after its last fix attempt", () =>
    Effect.gen(function* () {
      const { snapshot, steps } = yield* runBuild(
        { testReports: [testsFailed, testsFailed, testsFailed] },
        { fixAttempts: 2 },
      );
      expect(failureReasonOf(snapshot.error)).toStrictEqual({
        tag: "FixAttemptsExhausted",
        message:
          "Tests still failed after Build spent its fix-attempt budget of 2: 1 test failed: totals add VAT",
      });
      expect(steps).toStrictEqual(["implement", "test", "fix", "test", "fix", "test"]);
    }),
  );

  it.effect("hands the failures of the last test run to the fix", () =>
    Effect.gen(function* () {
      const { calls } = yield* runBuild({ testReports: [testsFailed, testsPassed] });
      expect(calls).toContainEqual({
        step: "fix",
        task: { workItemId: "wi-1", failures: "1 test failed: totals add VAT" },
      });
    }),
  );

  it.effect("reads its fix attempts from ROUAGE_MAX_BUILD_FIXES when none are given", () =>
    Effect.gen(function* () {
      const { snapshot } = yield* runBuild({ testReports: [testsFailed, testsFailed] }).pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ ROUAGE_MAX_BUILD_FIXES: "1" })),
        ),
      );
      expect(failureReasonOf(snapshot.error)).toStrictEqual({
        tag: "FixAttemptsExhausted",
        message:
          "Tests still failed after Build spent its fix-attempt budget of 1: 1 test failed: totals add VAT",
      });
    }),
  );
});

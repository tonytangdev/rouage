import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

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
        message: "Tests still failed after 2 fix attempts: 1 test failed: totals add VAT",
      });
      expect(steps).toStrictEqual(["implement", "test", "fix", "test", "fix", "test"]);
    }),
  );
});

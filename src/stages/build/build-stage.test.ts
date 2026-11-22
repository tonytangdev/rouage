import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { failureReasonOf } from "../../lifecycle/stage.ts";
import { describePortStage } from "../port-stage-contract.ts";
import { sandboxMissing } from "../sandbox-missing.ts";
import {
  bugCheck,
  bugImplement,
  bugInput,
  buildUnderTest,
  firstImplement,
  reproductionFailed,
  reproductionPassed,
  testsFailed,
  testsPassed,
} from "./build-harness.ts";

describe("build stage", () => {
  it.effect("asks the builder to address the change request, but only to fix the failures", () =>
    Effect.gen(function* () {
      const changeRequest = { from: "shipGate", text: "totals exclude VAT" } as const;
      const { fake } = yield* buildUnderTest.run(
        { testReports: [testsFailed, testsPassed] },
        { ...buildUnderTest.input, changeRequest },
      );
      const implement = { ...firstImplement, changeRequest };
      expect(fake.calls()).toStrictEqual([
        { step: "implement", task: implement },
        { step: "test", task: implement },
        { step: "fix", task: { ...implement, failures: testsFailed.failures } },
        { step: "test", task: implement },
      ]);
    }),
  );

  it.effect("checks a bug's reproduction in its sandbox once the tests pass", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* buildUnderTest.run(
        { testReports: [testsPassed], reproductionChecks: [reproductionPassed] },
        bugInput,
      );
      expect(settled.output).toStrictEqual({ _tag: "built" });
      expect(fake.calls().slice(1)).toStrictEqual([
        { step: "test", task: bugImplement },
        {
          step: "checkReproduction",
          task: bugCheck,
        },
      ]);
    }),
  );

  it.effect("fixes a reproduction that still fails, then tests and checks it again", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* buildUnderTest.run(
        {
          testReports: [testsPassed, testsPassed],
          reproductionChecks: [reproductionFailed, reproductionPassed],
        },
        bugInput,
      );
      expect(settled.output).toStrictEqual({ _tag: "built" });
      expect(fake.steps()).toStrictEqual([
        "implement",
        "test",
        "checkReproduction",
        "fix",
        "test",
        "checkReproduction",
      ]);
      expect(fake.calls()).toContainEqual({
        step: "fix",
        task: { ...bugImplement, failures: reproductionFailed.failures },
      });
    }),
  );

  it.effect(
    "fails with a StageFailure when the reproduction still fails after its last fix attempt",
    () =>
      Effect.gen(function* () {
        const { settled } = yield* buildUnderTest.run(
          {
            testReports: [testsPassed, testsPassed],
            reproductionChecks: [reproductionFailed, reproductionFailed],
            fixAttempts: 1,
          },
          bugInput,
        );
        expect(failureReasonOf(settled.error)).toStrictEqual({
          tag: "FixAttemptsExhausted",
          message:
            "The reproduction still failed after Build spent its fix-attempt budget of 1: repro-1 still failed: total is 0",
        });
      }),
  );

  it.effect("builds a feature without a reproduction, and checks nothing", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* buildUnderTest.run(
        { testReports: [testsPassed], reproductionChecks: [reproductionPassed] },
        { ...buildUnderTest.input, reproductionRef: null },
      );
      expect(settled.output).toStrictEqual({ _tag: "built" });
      expect(fake.steps()).toStrictEqual(["implement", "test"]);
    }),
  );

  it.effect("fails a feature that reaches it without a sandbox", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* buildUnderTest.run(
        { testReports: [testsPassed] },
        { ...buildUnderTest.input, sandboxRef: null },
      );
      expect(failureReasonOf(settled.error)).toStrictEqual(sandboxMissing("Build").reason);
      expect(fake.steps()).toStrictEqual([]);
    }),
  );

  it.effect("fails a bug that reaches it without a reproduction", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* buildUnderTest.run(
        { testReports: [testsPassed] },
        { ...bugInput, reproductionRef: null },
      );
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "ReproductionMissing",
        message:
          "Build started on a bug without a reproduction; send the work item back to Spec so Reproduce captures one",
      });
      expect(fake.steps()).toStrictEqual([]);
    }),
  );

  it.effect("fails a bug that reaches it without a sandbox", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* buildUnderTest.run(
        { testReports: [testsPassed] },
        { ...bugInput, sandboxRef: null },
      );
      expect(failureReasonOf(settled.error)).toStrictEqual(sandboxMissing("Build").reason);
      expect(fake.steps()).toStrictEqual([]);
    }),
  );

  it.effect("fixes and tests again until the tests pass", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* buildUnderTest.run({
        testReports: [testsFailed, testsFailed, testsPassed],
      });
      expect(settled.output).toStrictEqual({ _tag: "built" });
      expect(fake.steps()).toStrictEqual(["implement", "test", "fix", "test", "fix", "test"]);
    }),
  );

  it.effect("fails with a StageFailure when the tests still fail after its last fix attempt", () =>
    Effect.gen(function* () {
      const { settled, fake } = yield* buildUnderTest.run({
        testReports: [testsFailed, testsFailed, testsFailed],
        fixAttempts: 2,
      });
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "FixAttemptsExhausted",
        message:
          "Tests still failed after Build spent its fix-attempt budget of 2: 1 test failed: totals add VAT",
      });
      expect(fake.steps()).toStrictEqual(["implement", "test", "fix", "test", "fix", "test"]);
    }),
  );

  it.effect("hands the failures of the last test run to the fix", () =>
    Effect.gen(function* () {
      const { fake } = yield* buildUnderTest.run({ testReports: [testsFailed, testsPassed] });
      expect(fake.calls()).toContainEqual({
        step: "fix",
        task: { ...firstImplement, failures: "1 test failed: totals add VAT" },
      });
    }),
  );

  it.effect("reads its fix attempts from ROUAGE_MAX_BUILD_FIXES when none are given", () =>
    Effect.gen(function* () {
      const { settled } = yield* buildUnderTest
        .run({ testReports: [testsFailed, testsFailed] })
        .pipe(
          Effect.provide(
            ConfigProvider.layer(ConfigProvider.fromUnknown({ ROUAGE_MAX_BUILD_FIXES: "1" })),
          ),
        );
      expect(failureReasonOf(settled.error)).toStrictEqual({
        tag: "FixAttemptsExhausted",
        message:
          "Tests still failed after Build spent its fix-attempt budget of 1: 1 test failed: totals add VAT",
      });
    }),
  );
});

describePortStage(buildUnderTest);

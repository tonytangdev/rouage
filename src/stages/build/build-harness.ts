import { Effect } from "effect";

import { inputOnReaching } from "../../lifecycle/lifecycle-harness.ts";
import { goldenRefs } from "../../lifecycle/test-fixtures.ts";
import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { BuildOptions } from "./build-stage.ts";
import { buildStage } from "./build-stage.ts";
import type { FakeBuilderScript } from "./fake-builder.ts";
import { builderPort, fakeBuilder } from "./fake-builder.ts";

export const testsPassed = { _tag: "passed" } as const;
export const testsFailed = { _tag: "failed", failures: "1 test failed: totals add VAT" } as const;
export const reproductionPassed = { _tag: "passed" } as const;
export const reproductionFailed = {
  _tag: "failed",
  failures: "repro-1 still failed: total is 0",
} as const;

/** What the builder is asked to implement on a feature's first build. */
export const firstImplement = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  kind: "feature",
  specRef: goldenRefs.specRef,
  planRef: goldenRefs.planRef,
  sandboxRef: goldenRefs.sandboxRef,
  reproductionRef: null,
  changeRequest: null,
  feedback: null,
} as const;

/** What Build is given when a bug first reaches it. */
export const bugInput = inputOnReaching("build", { kind: "bug" });

/** What the builder is asked to check once a bug's tests pass. */
export const bugCheck = {
  workItemId: goldenRefs.workItemId,
  sandboxRef: goldenRefs.sandboxRef,
  reproductionRef: goldenRefs.reproductionRef,
} as const;

/** What the builder is asked to implement on a bug's first build. */
export const bugImplement = {
  ...firstImplement,
  kind: "bug",
  reproductionRef: goldenRefs.reproductionRef,
} as const;

/** The builder's script, with the Build options the stage is made with. */
export type BuildScript = FakeBuilderScript & BuildOptions;

export const buildUnderTest = portStageUnderTest(
  {
    name: "build",
    port: builderPort,
    scripted: Effect.fnUntraced(function* ({ fixAttempts, ...script }: BuildScript) {
      const fake = yield* fakeBuilder(script);
      const options = fixAttempts === undefined ? {} : { fixAttempts };
      return { fake, stage: yield* buildStage(options).pipe(Effect.provide(fake.layer)) };
    }),
    passing: (misbehaving) => ({
      testReports: [testsPassed],
      reproductionChecks: [reproductionPassed],
      misbehaving,
    }),
    outcome: { _tag: "built" },
    firstTask: firstImplement,
    reached: ["implement", "test"],
  },
  (declare) => [
    declare({
      step: "fix",
      misbehaving: (as) => ({ testReports: [testsFailed], misbehaving: { step: "fix", as } }),
      reach: (workItem) =>
        Effect.sync(() => {
          workItem.advanceTo("build");
        }),
    }),
    declare({
      step: "checkReproduction",
      misbehaving: (as) => ({
        testReports: [testsPassed],
        misbehaving: { step: "checkReproduction", as },
      }),
      reach: (workItem) =>
        Effect.sync(() => {
          workItem.advanceTo("build", { kind: "bug" });
        }),
    }),
  ],
);

/** A fake builder following the Build stage's passing script. */
export const passingBuilder = fakeBuilder(buildUnderTest.passing());

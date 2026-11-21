import { Effect } from "effect";

import { goldenRefs } from "../../lifecycle/golden-route.ts";
import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { BuildOptions } from "./build-stage.ts";
import { buildStage } from "./build-stage.ts";
import type { FakeBuilderScript } from "./fake-builder.ts";
import { builderPort, fakeBuilder } from "./fake-builder.ts";

export const testsPassed = { _tag: "passed" } as const;
export const testsFailed = { _tag: "failed", failures: "1 test failed: totals add VAT" } as const;

/** What the builder is asked to implement on a feature's first build. */
export const firstImplement = {
  workItemId: goldenRefs.workItemId,
  planRef: goldenRefs.planRef,
  feedback: null,
} as const;

/** The builder's script, with the Build options the stage is made with. */
export type BuildScript = FakeBuilderScript & BuildOptions;

export const buildUnderTest = portStageUnderTest({
  name: "build",
  port: builderPort,
  scripted: Effect.fnUntraced(function* ({ fixAttempts, ...script }: BuildScript) {
    const fake = yield* fakeBuilder(script);
    const options = fixAttempts === undefined ? {} : { fixAttempts };
    return { fake, stage: yield* buildStage(options).pipe(Effect.provide(fake.layer)) };
  }),
  passing: (misbehaving) => ({ testReports: [testsPassed], misbehaving }),
  outcome: { _tag: "built" },
  firstTask: firstImplement,
});

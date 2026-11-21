import { Effect } from "effect";

import { goldenRefs } from "../../lifecycle/lifecycle-harness.ts";
import { portStageUnderTest } from "../port-stage-under-test.ts";
import { demoStage } from "./demo-stage.ts";
import type { FakeDemonstratorScript } from "./fake-demonstrator.ts";
import { demonstratorPort, fakeDemonstrator } from "./fake-demonstrator.ts";

export const firstDemoMade = { demoRef: "demo-1" } as const;

/** What the demonstrator is asked on a feature's first demo. */
export const firstDemo = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  kind: "feature",
  specRef: goldenRefs.specRef,
  planRef: goldenRefs.planRef,
  sandboxRef: goldenRefs.sandboxRef,
  reproductionRef: null,
  previousDemoRef: null,
} as const;

export const demoUnderTest = portStageUnderTest({
  name: "demo",
  port: demonstratorPort,
  scripted: Effect.fnUntraced(function* (script: FakeDemonstratorScript) {
    const fake = yield* fakeDemonstrator(script);
    return { fake, stage: yield* demoStage.pipe(Effect.provide(fake.layer)) };
  }),
  passing: (misbehaving) => ({ demos: [firstDemoMade], misbehaving }),
  outcome: { _tag: "demonstrated", ...firstDemoMade },
  route: { demo: true },
  firstTask: firstDemo,
});

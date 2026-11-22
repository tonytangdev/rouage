import { goldenRefs } from "../../lifecycle/test-fixtures.ts";
import { portStageUnderTest, scriptedStage } from "../port-stage-under-test.ts";
import { demoStage } from "./demo-stage.ts";
import { demonstratorPort, fakeDemonstrator } from "./fake-demonstrator.ts";

export const firstDemoMade = { demoRef: goldenRefs.demoRef } as const;

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
  feedback: null,
} as const;

export const demoUnderTest = portStageUnderTest({
  name: "demo",
  port: demonstratorPort,
  scripted: scriptedStage(fakeDemonstrator, demoStage),
  passing: (misbehaving) => ({ demos: [firstDemoMade], misbehaving }),
  outcome: { _tag: "demonstrated", ...firstDemoMade },
  route: { demo: true },
  firstTask: firstDemo,
});

/** A fake demonstrator following the Demo stage's passing script. */
export const passingDemonstrator = fakeDemonstrator(demoUnderTest.passing());

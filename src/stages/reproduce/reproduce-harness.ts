import { goldenRefs } from "../../lifecycle/test-fixtures.ts";
import { portStageUnderTest, scriptedStage } from "../port-stage-under-test.ts";
import { fakeReproducer, reproducerPort } from "./fake-reproducer.ts";
import { reproduceStage } from "./reproduce-stage.ts";

export const captured = { _tag: "captured", reproductionRef: "repro-1" } as const;
export const checkFailed = { _tag: "failed" } as const;
export const checkPassed = { _tag: "passed", output: "1 test passed: totals add VAT" } as const;

/** What the reproducer is asked on a bug's first capture. */
export const firstCapture = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  specRef: goldenRefs.specRef,
  sandboxRef: goldenRefs.sandboxRef,
  sampleRef: null,
  sampleRequest: null,
  previousReproductionRef: null,
  feedback: null,
} as const;

/** What the reproducer is asked to confirm after the first capture. */
export const firstConfirm = {
  workItemId: goldenRefs.workItemId,
  sandboxRef: goldenRefs.sandboxRef,
  reproductionRef: captured.reproductionRef,
} as const;

export const reproduceUnderTest = portStageUnderTest({
  name: "reproduce",
  port: reproducerPort,
  scripted: scriptedStage(fakeReproducer, reproduceStage),
  passing: (misbehaving) => ({ captures: [captured], confirmations: [checkFailed], misbehaving }),
  outcome: { _tag: "reproduced", reproductionRef: captured.reproductionRef },
  route: { kind: "bug" },
  firstTask: firstCapture,
  reached: ["capture", "confirm"],
});

/** A fake reproducer following the Reproduce stage's passing script. */
export const passingReproducer = fakeReproducer(reproduceUnderTest.passing());

import { Effect } from "effect";

import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { FakeReproducerScript } from "./fake-reproducer.ts";
import { fakeReproducer, reproducerPort } from "./fake-reproducer.ts";
import { reproduceStage } from "./reproduce-stage.ts";

export const captured = { _tag: "captured", reproductionRef: "repro-1" } as const;
export const checkFailed = { _tag: "failed" } as const;
export const checkPassed = { _tag: "passed", output: "1 test passed: totals add VAT" } as const;

/** What the reproducer is asked on a bug's first capture. */
export const firstCapture = {
  workItemId: "wi-1",
  issueRef: "#1",
  specRef: "spec-1",
  sandboxRef: "box-1",
  sampleRef: null,
  sampleRequest: null,
  previousReproductionRef: null,
} as const;

/** What the reproducer is asked to confirm after the first capture. */
export const firstConfirm = {
  workItemId: "wi-1",
  sandboxRef: "box-1",
  reproductionRef: "repro-1",
} as const;

export const reproduceUnderTest = portStageUnderTest({
  name: "reproduce",
  port: reproducerPort,
  scripted: Effect.fnUntraced(function* (script: FakeReproducerScript) {
    const fake = yield* fakeReproducer(script);
    return { fake, stage: yield* reproduceStage.pipe(Effect.provide(fake.layer)) };
  }),
  passing: (misbehaving) => ({ captures: [captured], confirmations: [checkFailed], misbehaving }),
  outcome: { _tag: "reproduced", reproductionRef: "repro-1" },
  route: { kind: "bug" },
  next: "plan",
  firstTask: firstCapture,
});

import { Effect } from "effect";

import { goldenRefs } from "../../lifecycle/golden-route.ts";
import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { FakeClassifierScript } from "./fake-classifier.ts";
import { classifierPort, fakeClassifier } from "./fake-classifier.ts";
import { intakeStage } from "./intake-stage.ts";

export const isBug = { _tag: "classified", kind: "bug" } as const;
export const isFeature = { _tag: "classified", kind: "feature" } as const;
export const isUnclear = {
  _tag: "unclear",
  reason: "The issue asks for a change without saying what is wrong today",
} as const;

/** What the classifier is asked on a work item's first classification. */
export const firstClassify = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  feedback: null,
} as const;

export const intakeUnderTest = portStageUnderTest({
  name: "intake",
  port: classifierPort,
  scripted: Effect.fnUntraced(function* (script: FakeClassifierScript) {
    const fake = yield* fakeClassifier(script);
    return { fake, stage: yield* intakeStage.pipe(Effect.provide(fake.layer)) };
  }),
  passing: (misbehaving) => ({ results: [isBug], misbehaving }),
  outcome: { _tag: "classified", kind: "bug" },
  firstTask: firstClassify,
});

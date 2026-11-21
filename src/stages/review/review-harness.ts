import { Effect } from "effect";

import { portStageUnderTest } from "../port-stage-under-test.ts";
import type { FakeReviewerScript } from "./fake-reviewer.ts";
import { fakeReviewer, reviewerPort } from "./fake-reviewer.ts";
import { reviewStage } from "./review-stage.ts";

export const approval = { _tag: "approved" } as const;
export const changesRequested = { _tag: "changesRequested", feedback: "rename totals" } as const;

/** What the reviewer is asked on a feature's first review. */
export const firstReview = {
  workItemId: "wi-1",
  issueRef: "#1",
  kind: "feature",
  specRef: "spec-1",
  planRef: "plan-1",
  sandboxRef: "box-1",
  reproductionRef: null,
  demoRef: null,
} as const;

export const reviewUnderTest = portStageUnderTest({
  name: "review",
  port: reviewerPort,
  scripted: Effect.fnUntraced(function* (script: FakeReviewerScript) {
    const fake = yield* fakeReviewer(script);
    return { fake, stage: yield* reviewStage.pipe(Effect.provide(fake.layer)) };
  }),
  passing: (misbehaving) => ({ verdicts: [approval], misbehaving }),
  outcome: approval,
  next: "shipGate",
  firstTask: firstReview,
});

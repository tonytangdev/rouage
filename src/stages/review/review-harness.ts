import { goldenRefs } from "../../lifecycle/golden-route.ts";
import { portStageUnderTest, scriptedStage } from "../port-stage-under-test.ts";
import { fakeReviewer, reviewerPort } from "./fake-reviewer.ts";
import { reviewStage } from "./review-stage.ts";

export const approval = { _tag: "approved" } as const;
export const changesRequested = { _tag: "changesRequested", feedback: "rename totals" } as const;

/** What the reviewer is asked on a feature's first review. */
export const firstReview = {
  workItemId: goldenRefs.workItemId,
  issueRef: goldenRefs.issueRef,
  kind: "feature",
  specRef: goldenRefs.specRef,
  planRef: goldenRefs.planRef,
  sandboxRef: goldenRefs.sandboxRef,
  reproductionRef: null,
  demoRef: null,
  changeRequest: null,
  feedback: null,
} as const;

export const reviewUnderTest = portStageUnderTest({
  name: "review",
  port: reviewerPort,
  scripted: scriptedStage(fakeReviewer, reviewStage),
  passing: (misbehaving) => ({ verdicts: [approval], misbehaving }),
  outcome: approval,
  firstTask: firstReview,
});

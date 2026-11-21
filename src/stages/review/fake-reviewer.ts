import type { FakePort, Misbehaving } from "../fake-script.ts";
import { everyStep, fakePort } from "../fake-script.ts";
import type { Verdict } from "./reviewer.ts";
import { Reviewer, ReviewerGaveUp } from "./reviewer.ts";

export type ReviewStep = keyof Reviewer["Service"];

/** The reviewer as its fake and the stage contract suite know it. */
export const reviewerPort: FakePort<ReviewStep, ReviewerGaveUp> = {
  port: "reviewer",
  steps: everyStep<ReviewStep>()(["review"]),
  gaveUp: (message) => new ReviewerGaveUp({ message }),
};

export interface FakeReviewerScript {
  /** What each review returns, in order. */
  readonly verdicts: readonly Verdict[];
  readonly misbehaving?: Misbehaving<ReviewStep> | undefined;
}

/** A reviewer that follows a script instead of calling an AI. */
export const fakeReviewer = (script: FakeReviewerScript) =>
  fakePort(Reviewer, reviewerPort, script.misbehaving, ({ answer }) =>
    Reviewer.of({ review: (task) => answer("review", task, script.verdicts) }),
  );

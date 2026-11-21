import { Match, Schema } from "effect";

import type { FactEvent } from "./fact-event.ts";
import type { StandingFact } from "./facts.ts";
import { taughtBy } from "./outcome-teaching.ts";

const FeedbackSchema = Schema.Struct({
  /** A comment for the next stage to finish, set by a rejection, a retry or return to Spec with a comment, or an outcome that sends the change back, and cleared when any stage finishes. */
  feedback: Schema.NullOr(Schema.String),
});

// Feedback is for the next stage to finish and no other, so every stage
// finishing clears it unless the outcome sets new feedback.
const feedbackAfter = (feedback: string | null, event: FactEvent): string | null =>
  Match.valueTags(event, {
    stageFinished: ({ outcome }) => taughtBy(outcome).feedback,
    // A retry re-runs the looping stage itself, so what it asked for goes to
    // the human in the block's message instead.
    loopExhausted: () => null,
    gateRejected: ({ comment }) => comment,
    returnedToSpec: ({ comment }) => comment,
    // Without a comment the feedback stays, because the stage that failed
    // never acted on it.
    retried: ({ comment }) => comment ?? feedback,
    // An override's comment is recorded but is not feedback, so it never
    // displaces what the next stage must address (ADR 0011).
    demoOverridden: () => feedback,
  });

/** What the next stage to finish is asked to address. */
export const feedbackFact: StandingFact<typeof FeedbackSchema> = {
  schema: FeedbackSchema,
  empty: { feedback: null },
  after: ({ feedback }, event) => ({ feedback: feedbackAfter(feedback, event) }),
};

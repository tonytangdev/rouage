import { Match, Schema } from "effect";

import type { StandingFact } from "./facts.ts";
import type { Teaching } from "./outcome-teaching.ts";
import type { Transition } from "./transition.ts";

const FeedbackSchema = Schema.Struct({
  /** A comment for the next stage to finish, set by a rejection, a retry or return to Spec with a comment, or an outcome that sends the change back, and cleared when any stage finishes. */
  feedback: Schema.NullOr(Schema.String),
});

// Feedback is for the next stage to finish and no other, so every stage
// finishing clears it unless the outcome sets new feedback. Any transition not
// matched leaves it, such as a demo override, whose comment is recorded but
// never displaces what the next stage must address (ADR 0011).
const feedbackAfter = (
  feedback: string | null,
  transition: Transition,
  taught: Teaching,
): string | null =>
  Match.value(transition).pipe(
    Match.tags({
      stageFinished: () => taught.feedback,
      gateRejected: ({ decision }) => decision.comment ?? null,
      // Without a comment the feedback stays, because the stage that failed
      // never acted on it.
      retried: ({ decision }) => decision.comment ?? feedback,
      sentBackToSpec: ({ decision }) => decision.comment ?? null,
    }),
    Match.orElse(() => feedback),
  );

/** What the next stage to finish is asked to address. */
export const feedbackFact: StandingFact<typeof FeedbackSchema> = {
  schema: FeedbackSchema,
  empty: { feedback: null },
  after: ({ feedback }, transition, taught) => ({
    feedback: feedbackAfter(feedback, transition, taught),
  }),
};

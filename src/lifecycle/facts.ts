import { Match, Struct } from "effect";

import { changeRequestAfter } from "./change-request.ts";
import type { DemoFacts } from "./demo-decision.ts";
import { demoFactNames, demoFactsAfter } from "./demo-decision.ts";
import type { FactEvent } from "./fact-event.ts";
import { taughtBy } from "./outcome-teaching.ts";
import type { StageFacts } from "./stage.ts";

/** The facts only the outcome that teaches them changes, each replaced only by a newer one (ADR 0004). */
export type References = Omit<
  StageFacts,
  "issueRef" | "feedback" | "changeRequest" | keyof DemoFacts
>;

const referencesAfter = (event: FactEvent): Partial<References> =>
  event._tag === "stageFinished" || event._tag === "loopExhausted"
    ? taughtBy(event.outcome).references
    : {};

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

/**
 * The work item's facts after `event`, the only way they change. References
 * are replaced only by the outcome that teaches a newer one; feedback, the
 * change request and the demo facts each follow their own lifetime.
 */
export const factsAfter = (facts: StageFacts, event: FactEvent): StageFacts => ({
  ...facts,
  ...referencesAfter(event),
  feedback: feedbackAfter(facts.feedback, event),
  changeRequest: changeRequestAfter(facts.changeRequest, event),
  ...demoFactsAfter(Struct.pick(facts, demoFactNames), event),
});

import { Match, Struct } from "effect";

import { changeRequestAfter } from "./change-request.ts";
import type { DemoFacts } from "./demo-decision.ts";
import { demoFactNames, demoFactsAfter } from "./demo-decision.ts";
import type { AnyOutcome, FactEvent } from "./fact-event.ts";
import { changesRequestedIn } from "./fact-event.ts";
import type { OutcomeOf, StageFacts, StageName } from "./stage.ts";

/** The facts only the outcome that teaches them changes, each replaced only by a newer one (ADR 0004). */
type References = Omit<StageFacts, "issueRef" | "feedback" | "changeRequest" | keyof DemoFacts>;

type OutcomeTag = AnyOutcome["_tag"];

// A tag two stages share would be taught as one outcome, so the table below
// fails to compile until the tags are unique again.
type SharedOutcomeTag = {
  readonly [Stage in StageName]: Extract<
    OutcomeOf<Stage>["_tag"],
    OutcomeOf<Exclude<StageName, Stage>>["_tag"]
  >;
}[StageName];

type ReferencesTaught = {
  readonly [Tag in OutcomeTag]: (
    outcome: Extract<AnyOutcome, { _tag: Tag }>,
  ) => Partial<References>;
};

const nothing = (): Partial<References> => ({});

// Keyed by tag, so an outcome added to a stage fails to compile here until it
// says what it teaches, even when that is nothing.
const referencesTaught: [SharedOutcomeTag] extends [never] ? ReferencesTaught : never = {
  classified: ({ kind }) => ({ kind }),
  written: ({ specRef }) => ({ specRef }),
  provisioned: ({ sandboxRef, sampleRef }) => ({ sandboxRef, sampleRef }),
  awaitingRun: ({ sandboxRef, scriptRef }) => ({ sandboxRef, scriptRef }),
  reproduced: ({ reproductionRef }) => ({ reproductionRef }),
  needsSample: ({ sampleRequest }) => ({ sampleRequest }),
  cannotReproduce: nothing,
  checkPassed: ({ reproductionRef }) => ({ reproductionRef }),
  planned: ({ planRef }) => ({ planRef }),
  built: nothing,
  demonstrated: nothing,
  approved: nothing,
  changesRequested: nothing,
  shipped: ({ deliveryRef }) => ({ deliveryRef }),
};

const referencesAfter = (event: FactEvent): Partial<References> =>
  event._tag === "stageFinished" || event._tag === "loopExhausted"
    ? Match.valueTags(event.outcome, referencesTaught)
    : {};

// Feedback is for the next stage to finish and no other, so every stage
// finishing clears it unless the outcome sets new feedback.
const feedbackAfter = (feedback: string | null, event: FactEvent): string | null =>
  Match.valueTags(event, {
    stageFinished: changesRequestedIn,
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

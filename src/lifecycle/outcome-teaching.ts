import { Match } from "effect";

import type { ChangeRequest } from "./change-request.ts";
import type { AnyOutcome } from "./fact-event.ts";
import type { References } from "./facts.ts";
import type { OutcomeOf, StageName } from "./stage.ts";

/** What a stage finishing with one outcome teaches the work item, beyond the demo facts. */
export interface Teaching {
  readonly references: Partial<References>;
  /** What the next stage to finish must address, or `null` for nothing. */
  readonly feedback: string | null;
  /** What the change is sent back to Build to address, or `null` when the outcome does not send it back. */
  readonly changeRequest: ChangeRequest | null;
}

type OutcomeTag = AnyOutcome["_tag"];

// A tag two stages share would be taught as one outcome, so the table below
// fails to compile until the tags are unique again.
type SharedOutcomeTag = {
  readonly [Stage in StageName]: Extract<
    OutcomeOf<Stage>["_tag"],
    OutcomeOf<Exclude<StageName, Stage>>["_tag"]
  >;
}[StageName];

type Teachings = {
  readonly [Tag in OutcomeTag]: (outcome: Extract<AnyOutcome, { _tag: Tag }>) => Teaching;
};

const teaches = (taught: Partial<Teaching>): Teaching => ({
  references: {},
  feedback: null,
  changeRequest: null,
  ...taught,
});

const nothing = (): Teaching => teaches({});

// Keyed by tag, so an outcome added to a stage fails to compile here until it
// says what it teaches, including whether it sends the change back to Build.
const teachings: [SharedOutcomeTag] extends [never] ? Teachings : never = {
  classified: ({ kind }) => teaches({ references: { kind } }),
  written: ({ specRef }) => teaches({ references: { specRef } }),
  provisioned: ({ sandboxRef, sampleRef }) => teaches({ references: { sandboxRef, sampleRef } }),
  awaitingRun: ({ sandboxRef, scriptRef }) => teaches({ references: { sandboxRef, scriptRef } }),
  reproduced: ({ reproductionRef }) => teaches({ references: { reproductionRef } }),
  needsSample: ({ sampleRequest }) => teaches({ references: { sampleRequest } }),
  cannotReproduce: nothing,
  checkPassed: ({ reproductionRef }) => teaches({ references: { reproductionRef } }),
  planned: ({ planRef }) => teaches({ references: { planRef } }),
  built: nothing,
  demonstrated: nothing,
  approved: nothing,
  changesRequested: ({ feedback }) =>
    teaches({ feedback, changeRequest: { from: "review", text: feedback } }),
  shipped: ({ deliveryRef }) => teaches({ references: { deliveryRef } }),
};

/** What `outcome` teaches the work item when its stage finishes with it. */
export const taughtBy = (outcome: AnyOutcome): Teaching => Match.valueTags(outcome, teachings);

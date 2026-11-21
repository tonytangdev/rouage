import { Match } from "effect";

import type { ChangeRequest } from "./change-request.ts";
import type { DemoFacts } from "./demo-decision.ts";
import type { References } from "./facts.ts";
import type { LoopName } from "./loops.ts";
import type { FailureReason, OutcomeOf, StageName } from "./stage.ts";
import type { AnyOutcome } from "./transition.ts";

/** How an outcome sends the work item around a loop, and why it blocks once the loop reaches `limit`. */
export interface LoopTrip {
  readonly loop: LoopName;
  /** Told to the human once the loop reaches `limit`, with what the outcome asked for when it asked for something. */
  readonly describe: (limit: number) => string;
}

/** Everything a stage finishing with one outcome means for the work item. */
export interface Teaching {
  readonly references: Partial<References>;
  /** What the next stage to finish must address, or `null` for nothing. */
  readonly feedback: string | null;
  /** What the change is sent back to Build to address, or `null` when the outcome does not send it back. */
  readonly changeRequest: ChangeRequest | null;
  /** The demo facts the outcome changes; a human's override is never taught by a stage (ADR 0011). */
  readonly demo: Partial<Omit<DemoFacts, "demoOverride">>;
  /** The loop the outcome sends the work item around, or `null` when it sends it on. */
  readonly loop: LoopTrip | null;
  /** Why the outcome blocks the work item, or `null` when it does not. */
  readonly blocks: FailureReason | null;
}

type OutcomeTag = AnyOutcome["_tag"];

// Named here, apart from the table, so the compiler holds each entry to it:
// these entries must give a reason, and every other entry must give none.
type BlockingTag = "cannotReproduce" | "checkPassed";

/** The outcomes that finish their stage but block the work item. */
export type BlockingOutcome = Extract<AnyOutcome, { readonly _tag: BlockingTag }>;

/** The teaching of an outcome that blocks, whose reason is always there. */
export interface BlockingTeaching extends Teaching {
  readonly blocks: FailureReason;
}

type TeachingOf<Tag extends OutcomeTag> = Tag extends BlockingTag
  ? BlockingTeaching
  : Teaching & { readonly blocks: null };

// A tag two stages share would be taught as one outcome, so the table below
// fails to compile until the tags are unique again.
type SharedOutcomeTag = {
  readonly [Stage in StageName]: Extract<
    OutcomeOf<Stage>["_tag"],
    OutcomeOf<Exclude<StageName, Stage>>["_tag"]
  >;
}[StageName];

type Teachings = {
  readonly [Tag in OutcomeTag]: (outcome: Extract<AnyOutcome, { _tag: Tag }>) => TeachingOf<Tag>;
};

/** What a transition that is not a stage finishing teaches: nothing. */
export const nothingTaught: Teaching & { readonly blocks: null } = {
  references: {},
  feedback: null,
  changeRequest: null,
  demo: {},
  loop: null,
  blocks: null,
};

const teaches = (taught: Partial<Omit<Teaching, "blocks">>) => ({ ...nothingTaught, ...taught });

const nothing = () => nothingTaught;

const blocking = (blocked: FailureReason, references: Partial<References> = {}) => ({
  ...nothingTaught,
  references,
  blocks: blocked,
});

const sentBackToBuild = (from: "review" | "ship", feedback: string, loop: LoopTrip) =>
  teaches({ feedback, changeRequest: { from, text: feedback }, loop });

// Keyed by tag, so an outcome added to a stage fails to compile here until it
// says what it teaches, including whether it loops or blocks.
const teachings: [SharedOutcomeTag] extends [never] ? Teachings : never = {
  classified: ({ kind }) => teaches({ references: { kind } }),
  written: ({ specRef }) => teaches({ references: { specRef } }),
  provisioned: ({ sandboxRef, sampleRef }) => teaches({ references: { sandboxRef, sampleRef } }),
  awaitingRun: ({ sandboxRef, scriptRef }) => teaches({ references: { sandboxRef, scriptRef } }),
  reproduced: ({ reproductionRef }) => teaches({ references: { reproductionRef } }),
  needsSample: ({ sampleRequest }) =>
    teaches({
      references: { sampleRequest },
      loop: {
        loop: "reproduce",
        describe: (limit) => `Reproduce went back to Provision ${limit} times`,
      },
    }),
  cannotReproduce: ({ reason }) => blocking({ tag: "CannotReproduce", message: reason }),
  // The reproduction is kept, so a retry revises it rather than starting over (ADR 0009).
  checkPassed: ({ reproductionRef, output }) =>
    blocking(
      {
        tag: "ReproductionDidNotFail",
        message: `The reproduction ${reproductionRef} passed, so it does not show the bug: ${output}`,
      },
      { reproductionRef },
    ),
  planned: ({ planRef, demo }) => teaches({ references: { planRef }, demo: { demoPlanned: demo } }),
  // A demo made before the latest build no longer shows the change.
  built: () => teaches({ demo: { demoOutdated: true } }),
  demonstrated: ({ demoRef }) => teaches({ demo: { demoRef, demoOutdated: false } }),
  approved: nothing,
  changesRequested: ({ feedback }) =>
    sentBackToBuild("review", feedback, {
      loop: "review",
      describe: (limit) =>
        `Review sent the change back to Build ${limit} times, and last asked: ${feedback}`,
    }),
  shipped: ({ deliveryRef }) => teaches({ references: { deliveryRef } }),
  needsRebuild: ({ feedback }) =>
    sentBackToBuild("ship", feedback, {
      loop: "ship",
      describe: (limit) =>
        `Ship sent the change back to Build ${limit} times, and last asked: ${feedback}`,
    }),
};

/** What `outcome` means for the work item when its stage finishes with it. */
export const taughtBy = (outcome: AnyOutcome): Teaching => Match.valueTags(outcome, teachings);

export const isBlocking = (teaching: Teaching): teaching is BlockingTeaching =>
  teaching.blocks !== null;

/** `taughtBy` for an outcome that blocks, whose reason is always there. */
export const blockingTaughtBy = (outcome: BlockingOutcome): BlockingTeaching =>
  Match.valueTags(outcome, {
    cannotReproduce: teachings.cannotReproduce,
    checkPassed: teachings.checkPassed,
  });

/** What the work item still learns from an outcome whose loop reached its limit: not its feedback or change request, because the change is not sent back, and what it asked for goes to the human in the block's message instead. */
export const exhaustedTeaching = (teaching: Teaching): Teaching => ({
  ...teaching,
  feedback: null,
  changeRequest: null,
});

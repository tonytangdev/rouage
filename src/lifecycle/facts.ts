import { Match } from "effect";

import { demoMade, demoOutdatedByBuild, demoPlannedBy } from "./demo-decision.ts";
import type { OutcomeOf, StageFacts, StageName } from "./stage.ts";
import type { WorkItemContext } from "./work-item.ts";

/**
 * The context change when an outcome or a human's decision sets some of the
 * work item's facts. Every fact not in `learnt` keeps its value, so a
 * reference is only ever replaced by a newer one (ADR 0004).
 */
export const learned = (context: WorkItemContext, learnt: Partial<StageFacts>) => ({
  facts: { ...context.facts, ...learnt },
});

type FactsTaught = {
  readonly [Stage in StageName]: (outcome: OutcomeOf<Stage>) => Partial<StageFacts>;
};

const nothing = (): Partial<StageFacts> => ({});

// Matched by tag, so an outcome added to a stage fails to compile here until
// it says what it teaches, even when that is nothing.
const factsTaught: FactsTaught = {
  intake: (outcome) => Match.valueTags(outcome, { classified: ({ kind }) => ({ kind }) }),
  spec: (outcome) => Match.valueTags(outcome, { written: ({ specRef }) => ({ specRef }) }),
  provision: (outcome) =>
    Match.valueTags(outcome, {
      provisioned: ({ sandboxRef, sampleRef }) => ({ sandboxRef, sampleRef }),
      awaitingRun: ({ sandboxRef, scriptRef }) => ({ sandboxRef, scriptRef }),
    }),
  reproduce: (outcome) =>
    Match.valueTags(outcome, {
      reproduced: ({ reproductionRef }) => ({ reproductionRef }),
      needsSample: ({ sampleRequest }) => ({ sampleRequest }),
      cannotReproduce: nothing,
      checkPassed: ({ reproductionRef }) => ({ reproductionRef }),
    }),
  plan: (outcome) =>
    Match.valueTags(outcome, {
      planned: ({ planRef, demo }) => ({ planRef, ...demoPlannedBy(demo) }),
    }),
  build: (outcome) => Match.valueTags(outcome, { built: () => demoOutdatedByBuild }),
  demo: (outcome) => Match.valueTags(outcome, { demonstrated: ({ demoRef }) => demoMade(demoRef) }),
  review: (outcome) =>
    Match.valueTags(outcome, {
      approved: nothing,
      changesRequested: ({ feedback }) => ({ feedback }),
    }),
  ship: (outcome) => Match.valueTags(outcome, { shipped: ({ deliveryRef }) => ({ deliveryRef }) }),
};

/**
 * The context change when `stage` finishes with `outcome`: the facts the
 * outcome teaches, and `feedback` cleared unless the outcome sets new
 * feedback, because feedback is for the next stage to finish and no other.
 */
export const stageFinished = <Stage extends StageName>(
  context: WorkItemContext,
  stage: Stage,
  outcome: OutcomeOf<Stage>,
) => {
  const teach: FactsTaught[Stage] = factsTaught[stage];
  return learned(context, { feedback: null, ...teach(outcome) });
};

type IsUnion<T, Whole = T> = T extends unknown ? ([Whole] extends [T] ? false : true) : never;

/** The stages whose stage machine has exactly one outcome. */
export type SoleOutcomeStage = {
  readonly [Stage in StageName]: true extends IsUnion<OutcomeOf<Stage>> ? never : Stage;
}[StageName];

/**
 * `stageFinished` for a stage with exactly one outcome, whose transition need
 * not match on the outcome's tag. Giving such a stage a second outcome fails
 * to compile at each call, so its transition is made to route by tag.
 */
export const soleOutcomeFinished = <Stage extends SoleOutcomeStage>(
  context: WorkItemContext,
  stage: Stage,
  outcome: OutcomeOf<Stage>,
) => stageFinished(context, stage, outcome);

import type { OutcomeOf, StageFacts, StageName } from "./stage.ts";
import type { WorkItemContext } from "./work-item.ts";
import { learned } from "./work-item.ts";

type FactsTaught = {
  readonly [Stage in StageName]: (outcome: OutcomeOf<Stage>) => Partial<StageFacts>;
};

const factsTaught: FactsTaught = {
  intake: ({ kind }) => ({ kind }),
  spec: ({ specRef }) => ({ specRef }),
  provision: ({ sandboxRef, sampleRef }) => ({ sandboxRef, sampleRef }),
  reproduce: (outcome) => {
    if (outcome._tag === "reproduced") {
      return { reproductionRef: outcome.reproductionRef };
    }
    return outcome._tag === "needsSample" ? { sampleRequest: outcome.sampleRequest } : {};
  },
  plan: ({ planRef, demo }) => ({ planRef, demoPlanned: demo }),
  build: () => ({}),
  demo: ({ demoRef }) => ({ demoRef }),
  review: (outcome) => (outcome._tag === "changesRequested" ? { feedback: outcome.feedback } : {}),
  ship: ({ deliveryRef }) => ({ deliveryRef }),
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

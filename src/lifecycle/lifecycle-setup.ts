import type { ActorRefFrom } from "xstate";
import { setup, types } from "xstate";

import type { Blocked } from "./blocked.ts";
import type {
  BuildOutcome,
  DemoOutcome,
  IntakeOutcome,
  PlanOutcome,
  ProvisionOutcome,
  ReproduceOutcome,
  ReviewOutcome,
  ShipOutcome,
  SpecOutcome,
  StageInput,
} from "./outcomes.ts";
import { stubStage } from "./stub-stage.ts";
import type { HumanDecision, WorkItemContext, WorkItemInput } from "./work-item.ts";

const stages = {
  intake: stubStage<IntakeOutcome>(),
  spec: stubStage<SpecOutcome>(),
  provision: stubStage<ProvisionOutcome>(),
  reproduce: stubStage<ReproduceOutcome>(),
  plan: stubStage<PlanOutcome>(),
  build: stubStage<BuildOutcome>(),
  demo: stubStage<DemoOutcome>(),
  review: stubStage<ReviewOutcome>(),
  ship: stubStage<ShipOutcome>(),
};

type StageRef<Name extends keyof typeof stages> = ActorRefFrom<(typeof stages)[Name]>;

export const lifecycleSetup = setup({
  schemas: {
    input: types<WorkItemInput>(),
    context: types<WorkItemContext>(),
    events: {
      approve: types<HumanDecision>(),
      reject: types<HumanDecision>(),
      retry: types<HumanDecision>(),
      backToSpec: types<HumanDecision>(),
      cancel: types<HumanDecision>(),
    },
    // Declared so a stage's error event names the stage by its literal id.
    children: {
      intake: types<StageRef<"intake">>(),
      spec: types<StageRef<"spec">>(),
      provision: types<StageRef<"provision">>(),
      reproduce: types<StageRef<"reproduce">>(),
      plan: types<StageRef<"plan">>(),
      build: types<StageRef<"build">>(),
      demo: types<StageRef<"demo">>(),
      review: types<StageRef<"review">>(),
      ship: types<StageRef<"ship">>(),
    },
  },
  actors: stages,
  states: {
    working: {
      initial: "intake",
      states: {
        intake: {},
        spec: {},
        specGate: {},
        provision: {},
        reproduce: {},
        plan: {},
        build: {},
        demo: {},
        review: {},
        shipGate: {},
        ship: {},
        lastStage: { type: "history", target: "intake" },
      },
    },
    blocked: { id: "blocked", schemas: { context: types<{ blocked: Blocked }>() } },
    shipped: { id: "shipped", type: "final" },
    cancelled: { type: "final" },
  },
});

/** What every stage machine is started with. */
export const stageInput = ({ context }: { context: WorkItemContext }): StageInput => ({
  workItemId: context.id,
  kind: context.kind,
  feedback: context.feedback,
});

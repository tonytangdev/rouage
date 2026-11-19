import type { ActorRefFrom } from "xstate";
import { setup, types } from "xstate";

import type { Blocked } from "./blocked.ts";
import type { StageName } from "./stage.ts";
import { stubStages } from "./stub-stage.ts";
import type { HumanDecision, WorkItemContext, WorkItemInput } from "./work-item.ts";

// XState needs each stage slot as its own key, and the compiler only checks
// those keys against `StageName` through `satisfies`.
const stages = stubStages() satisfies Record<StageName, unknown>;

type StageRef<Name extends StageName> = ActorRefFrom<(typeof stages)[Name]>;

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
    } satisfies Record<StageName, unknown>,
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

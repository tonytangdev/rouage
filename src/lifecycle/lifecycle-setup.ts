import { Schema } from "effect";
import type { ActorRefFrom } from "xstate";
import { setup, types } from "xstate";

import type { Blocked } from "./blocked.ts";
import { stageSlot } from "./stage-slot.ts";
import type { StageName } from "./stage.ts";
import type { HumanDecision, WorkItemInput } from "./work-item.ts";
import { WorkItemContextSchema } from "./work-item.ts";

// XState needs each stage slot as its own key, and the compiler only checks
// those keys against `StageName` through `satisfies`. Written out rather than
// built from `StageName`, because an object built at runtime widens to one
// union value type, and only an assertion would restore each key's own type.
const stages = {
  intake: stageSlot("intake"),
  spec: stageSlot("spec"),
  provision: stageSlot("provision"),
  reproduce: stageSlot("reproduce"),
  plan: stageSlot("plan"),
  build: stageSlot("build"),
  demo: stageSlot("demo"),
  review: stageSlot("review"),
  ship: stageSlot("ship"),
} satisfies Record<StageName, unknown>;

type StageRef<Name extends StageName> = ActorRefFrom<(typeof stages)[Name]>;

// Declared apart from `setup` so the lifecycle's places are named from these
// keys. Naming them from the machine's type instead makes the types cycle,
// because the machine's transitions call helpers typed by those names.
const workingStates = {
  intake: {},
  spec: {},
  specGate: {},
  provision: {},
  sampleGate: {},
  reproduce: {},
  plan: {},
  build: {},
  demo: {},
  review: {},
  shipGate: {},
  ship: {},
  lastStage: { type: "history", target: "intake" },
} as const;

const lifecycleStates = {
  working: { initial: "intake", states: workingStates },
  blocked: { id: "blocked", schemas: { context: types<{ blocked: Blocked }>() } },
  shipped: { id: "shipped", type: "final" },
  cancelled: { type: "final" },
} as const;

/** The places inside the working state: every stage and gate. */
export type WorkingPlace = Exclude<keyof typeof workingStates, "lastStage">;

/** The places outside the working state: Blocked and the final states. */
export type OuterPlace = Exclude<keyof typeof lifecycleStates, "working">;

export const lifecycleSetup = setup({
  schemas: {
    input: types<WorkItemInput>(),
    context: Schema.toStandardSchemaV1(WorkItemContextSchema),
    events: {
      approve: types<HumanDecision>(),
      reject: types<HumanDecision>(),
      retry: types<HumanDecision>(),
      backToSpec: types<HumanDecision>(),
      cancel: types<HumanDecision>(),
      requireDemo: types<HumanDecision>(),
      skipDemo: types<HumanDecision>(),
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
  states: lifecycleStates,
});

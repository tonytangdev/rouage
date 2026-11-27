import { Schema } from "effect";
import type { ActorRefFrom, TypeSchema } from "xstate";
import { setup, types } from "xstate";

import type { GatekeeperLogic } from "./gatekeeper-step.ts";
import { gatekeeperSlot } from "./gatekeeper-step.ts";
import { lifecycleStates } from "./lifecycle-states.ts";
import type { StageLogic } from "./stage-slot.ts";
import { stageSlot } from "./stage-slot.ts";
import type { StageName } from "./stage.ts";
import type { HumanDecision, WorkItemInput } from "./work-item.ts";
import { WorkItemContextSchema } from "./work-item.ts";

// XState needs each stage slot, and each stage's child, as its own key with
// its own type. Written out rather than built from the stage outcomes, because
// an object built at runtime widens to one union value type, and only an
// assertion would restore each key's own type. The mapped types below reject a
// missing stage, an extra key, and an entry typed for the wrong stage.
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
} satisfies { readonly [Stage in StageName]: StageLogic<Stage> };

type StageRef<Name extends StageName> = ActorRefFrom<(typeof stages)[Name]>;

const stageChildren = {
  intake: types<StageRef<"intake">>(),
  spec: types<StageRef<"spec">>(),
  provision: types<StageRef<"provision">>(),
  reproduce: types<StageRef<"reproduce">>(),
  plan: types<StageRef<"plan">>(),
  build: types<StageRef<"build">>(),
  demo: types<StageRef<"demo">>(),
  review: types<StageRef<"review">>(),
  ship: types<StageRef<"ship">>(),
} satisfies { readonly [Stage in StageName]: TypeSchema<StageRef<Stage>> };

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
    // Declared so a child's error event names the stage, or the gatekeeper, by its literal id.
    children: {
      ...stageChildren,
      gatekeeper: types<ActorRefFrom<GatekeeperLogic>>(),
    },
  },
  actors: { ...stages, gatekeeper: gatekeeperSlot },
  states: lifecycleStates,
});

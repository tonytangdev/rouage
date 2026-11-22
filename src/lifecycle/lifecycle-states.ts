import { types } from "xstate";

import type { Blocked } from "./blocked.ts";
import type { StageName } from "./stage.ts";

// Declared apart from the machine's setup so the lifecycle's places are named
// from these keys. Naming them from the machine's type instead makes the types
// cycle, because the machine's transitions call helpers typed by those names.
// In a module of their own because the places module reads these keys at
// runtime, and the setup module imports it through the work item's Schema.

/**
 * The states inside the working state: every stage and gate, in the order the
 * lifecycle first reaches them, and the history of the last one. Must list
 * every stage; any other place is a gate.
 */
export const workingStates = {
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
} as const satisfies Readonly<Record<StageName, object> & Record<string, object>>;

/** The lifecycle's top-level states: working through the stages, Blocked, and the final states. */
export const lifecycleStates = {
  working: { initial: "intake", states: workingStates },
  blocked: { id: "blocked", schemas: { context: types<{ blocked: Blocked }>() } },
  shipped: { id: "shipped", type: "final" },
  cancelled: { type: "final" },
} as const;

/** The places inside the working state: every stage and gate. */
export type WorkingPlace = Exclude<keyof typeof workingStates, "lastStage">;

/** The places outside the working state: Blocked and the final states. */
export type OuterPlace = Exclude<keyof typeof lifecycleStates, "working">;

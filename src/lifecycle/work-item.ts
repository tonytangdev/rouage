import { Schema } from "effect";

import { BlockedSchema } from "./blocked.ts";
import { noFactsYet, StageFactsSchema } from "./facts.ts";
import type { Gatekeepers } from "./gatekeepers.ts";
import { GatekeepersSchema } from "./gatekeepers.ts";
import { HandOffSchema } from "./hand-off.ts";
import type { LoopLimits } from "./loops.ts";
import { noLoopsYet, PerLoopCount } from "./loops.ts";
import { PlaceSchema } from "./place.ts";

export interface WorkItemInput {
  readonly id: string;
  readonly issueRef: string;
  readonly limits: LoopLimits;
  readonly gatekeepers: Gatekeepers;
}

/**
 * What a human sends to decide at a gate, for a blocked work item, or on
 * whether a demo is made, and what a plugin gatekeeper's decision at a gate
 * is sent as. `by` names who decided: the human, or the gatekeeper by its
 * prefixed name, as gatekeeper.ts records it. `at` is an ISO timestamp set
 * by the sender, because transitions read no clock.
 */
export interface HumanDecision {
  readonly by: string;
  readonly at: string;
  readonly comment?: string;
}

export const DecisionActionSchema = Schema.Literals([
  "approve",
  "reject",
  "retry",
  "backToSpec",
  "cancel",
  "requireDemo",
  "skipDemo",
]);
export type DecisionAction = typeof DecisionActionSchema.Type;

export const DecisionSchema = Schema.Struct({
  action: DecisionActionSchema,
  state: PlaceSchema,
  by: Schema.String,
  at: Schema.String,
  comment: Schema.NullOr(Schema.String),
});
export type Decision = typeof DecisionSchema.Type;

/** Everything a work item saves, changed only in work-item-after.ts, and checked against this Schema when it is restored (ADR 0002). */
export const WorkItemContextSchema = Schema.Struct({
  id: Schema.String,
  /** What stages are given to work from. */
  facts: StageFactsSchema,
  limits: PerLoopCount,
  /** Who decides at each gate, fixed when the work item is created (ADR 0021). */
  gatekeepers: GatekeepersSchema,
  counters: PerLoopCount,
  blocked: Schema.NullOr(BlockedSchema),
  /** Why the plugin keeping the gate the work item waits at left the decision to a human (ADR 0021). */
  handOff: Schema.NullOr(HandOffSchema),
  decisions: Schema.Array(DecisionSchema),
});
export type WorkItemContext = typeof WorkItemContextSchema.Type;

/** The context of a work item created from `input`, before any stage has worked on it. */
export const newWorkItemContext = (input: WorkItemInput): WorkItemContext => ({
  id: input.id,
  facts: { issueRef: input.issueRef, ...noFactsYet },
  limits: input.limits,
  gatekeepers: input.gatekeepers,
  counters: noLoopsYet,
  blocked: null,
  handOff: null,
  decisions: [],
});

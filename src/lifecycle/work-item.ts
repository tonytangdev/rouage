import { Schema } from "effect";

import { BlockedSchema } from "./blocked.ts";
import { StageFactsSchema } from "./facts.ts";
import type { LoopLimits } from "./loops.ts";
import { PerLoopCount } from "./loops.ts";

export interface WorkItemInput {
  readonly id: string;
  readonly issueRef: string;
  readonly limits: LoopLimits;
}

/** What a human sends to decide at a gate, for a blocked work item, or on whether a demo is made. `at` is an ISO timestamp set by the sender, because transitions read no clock. */
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
  state: Schema.String,
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
  counters: PerLoopCount,
  blocked: Schema.NullOr(BlockedSchema),
  decisions: Schema.Array(DecisionSchema),
});
export type WorkItemContext = typeof WorkItemContextSchema.Type;

import { Schema } from "effect";

import { BlockedSchema } from "./blocked.ts";
import { learned } from "./facts.ts";
import type { LoopLimits } from "./loops.ts";
import { PerLoopCount } from "./loops.ts";
import { StageFactsSchema } from "./stage.ts";

export interface WorkItemInput {
  readonly id: string;
  readonly issueRef: string;
  readonly limits: LoopLimits;
}

/** What a human sends to decide at a gate or for a blocked work item. `at` is an ISO timestamp set by the sender, because transitions read no clock. */
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

/** Everything a work item saves, checked against this Schema when it is restored (ADR 0002). */
export const WorkItemContextSchema = Schema.Struct({
  id: Schema.String,
  /** What every stage sees, changed only through `learned`. */
  facts: StageFactsSchema,
  limits: PerLoopCount,
  counters: PerLoopCount,
  blocked: Schema.NullOr(BlockedSchema),
  decisions: Schema.Array(DecisionSchema),
});
export type WorkItemContext = typeof WorkItemContextSchema.Type;

export const recordDecision = (
  context: WorkItemContext,
  action: DecisionAction,
  state: string,
  { by, at, comment }: HumanDecision,
): readonly Decision[] => [
  ...context.decisions,
  { action, state, by, at, comment: comment ?? null },
];

/** The context change for a gate approval. */
export const approved = (context: WorkItemContext, gate: string, decision: HumanDecision) => ({
  decisions: recordDecision(context, "approve", gate, decision),
});

/** The context change for a gate rejection: the comment becomes the feedback for the stage it returns to. */
export const rejected = (context: WorkItemContext, gate: string, decision: HumanDecision) => ({
  ...learned(context, { feedback: decision.comment ?? null }),
  decisions: recordDecision(context, "reject", gate, decision),
});

import { Schema } from "effect";

import { BlockedSchema } from "./blocked.ts";
import { changeRequestOnReturnToSpec, requestedAtShipGate } from "./change-request.ts";
import { demoOnReturnToSpec, demoRequiredByHuman, demoSkippedByHuman } from "./demo-decision.ts";
import { learned } from "./facts.ts";
import type { LoopLimits } from "./loops.ts";
import { PerLoopCount, noLoopsYet } from "./loops.ts";
import type { Gate } from "./place.ts";
import { StageFactsSchema } from "./stage.ts";

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

/** Everything a work item saves, checked against this Schema when it is restored (ADR 0002). */
export const WorkItemContextSchema = Schema.Struct({
  id: Schema.String,
  /** What stages are given to work from, changed only through `learned`. */
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
export const approved = (context: WorkItemContext, gate: Gate, decision: HumanDecision) => ({
  decisions: recordDecision(context, "approve", gate, decision),
});

/** The context change for a gate rejection: the comment becomes the feedback for the stage it returns to. */
export const rejected = (context: WorkItemContext, gate: Gate, decision: HumanDecision) => ({
  ...learned(context, { feedback: decision.comment ?? null }),
  decisions: recordDecision(context, "reject", gate, decision),
});

/** The context change for a ship gate rejection: a gate rejection that also makes the comment, or its absence, the change request Review checks next (ADR 0012). */
export const shipRejected = (context: WorkItemContext, decision: HumanDecision) => ({
  ...learned(context, {
    feedback: decision.comment ?? null,
    ...requestedAtShipGate(decision.comment ?? null),
  }),
  decisions: recordDecision(context, "reject", "shipGate", decision),
});

/** The context change for a spec gate rejection: a gate rejection that also returns the demo decision to the new spec's plan and drops the change request. */
export const specRejected = (context: WorkItemContext, decision: HumanDecision) => ({
  ...learned(context, {
    feedback: decision.comment ?? null,
    ...demoOnReturnToSpec,
    ...changeRequestOnReturnToSpec,
  }),
  decisions: recordDecision(context, "reject", "specGate", decision),
});

const unblocked = { blocked: null, counters: noLoopsYet };

/**
 * The context change for a retry from Blocked: unblocked with fresh loop
 * counters, and the comment, when there is one, as the feedback for the stage
 * it re-runs. Without a comment the feedback stays, because the stage that
 * failed never acted on it.
 */
export const retried = (context: WorkItemContext, decision: HumanDecision) => ({
  ...unblocked,
  ...(decision.comment === undefined ? {} : learned(context, { feedback: decision.comment })),
  decisions: recordDecision(context, "retry", "blocked", decision),
});

/**
 * The context change for sending a blocked work item back to Spec: unblocked
 * with fresh loop counters, the comment as the only feedback, the demo
 * decision returned to the new spec's plan, and no change request.
 */
export const sentBack = (context: WorkItemContext, decision: HumanDecision) => ({
  ...unblocked,
  ...learned(context, {
    feedback: decision.comment ?? null,
    ...demoOnReturnToSpec,
    ...changeRequestOnReturnToSpec,
  }),
  decisions: recordDecision(context, "backToSpec", "blocked", decision),
});

// An override's comment is recorded but is not feedback, so it never displaces
// what the next stage must address (ADR 0011).

/** The context change when a human requires a demo in `state`: the requirement stands over any later plan. */
export const demoRequired = (context: WorkItemContext, state: string, decision: HumanDecision) => ({
  ...learned(context, demoRequiredByHuman),
  decisions: recordDecision(context, "requireDemo", state, decision),
});

/** The context change when a human skips a demo in `state`: the skip stands over any later plan. */
export const demoSkipped = (context: WorkItemContext, state: string, decision: HumanDecision) => ({
  ...learned(context, demoSkippedByHuman),
  decisions: recordDecision(context, "skipDemo", state, decision),
});

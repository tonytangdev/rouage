import { Schema } from "effect";

import { BlockedSchema } from "./blocked.ts";
import type { RejectingGate } from "./fact-event.ts";
import { StageFactsSchema, factsAfter } from "./facts.ts";
import type { LoopLimits } from "./loops.ts";
import { PerLoopCount, noLoopsYet } from "./loops.ts";
import type { Gate } from "./place.ts";

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
  /** What stages are given to work from, changed only through `factsAfter`. */
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

/**
 * The context change for a rejection at the sample or ship gate: the comment
 * becomes the feedback for the stage it returns to, and at the ship gate the
 * change request Review checks next (ADR 0012).
 */
export const rejected = (
  context: WorkItemContext,
  gate: RejectingGate,
  decision: HumanDecision,
) => ({
  facts: factsAfter(context.facts, {
    _tag: "gateRejected",
    gate,
    comment: decision.comment ?? null,
  }),
  decisions: recordDecision(context, "reject", gate, decision),
});

const returnedToSpec = (context: WorkItemContext, decision: HumanDecision) => ({
  facts: factsAfter(context.facts, { _tag: "returnedToSpec", comment: decision.comment ?? null }),
});

/** The context change for a spec gate rejection: the comment as feedback for the new spec. */
export const specRejected = (context: WorkItemContext, decision: HumanDecision) => ({
  ...returnedToSpec(context, decision),
  decisions: recordDecision(context, "reject", "specGate", decision),
});

const unblocked = { blocked: null, counters: noLoopsYet };

/** The context change for a retry from Blocked: unblocked with fresh loop counters, the comment, when there is one, as feedback for the stage it re-runs. */
export const retried = (context: WorkItemContext, decision: HumanDecision) => ({
  ...unblocked,
  facts: factsAfter(context.facts, { _tag: "retried", comment: decision.comment ?? null }),
  decisions: recordDecision(context, "retry", "blocked", decision),
});

/** The context change for sending a blocked work item back to Spec: unblocked with fresh loop counters, and the comment as feedback for the new spec. */
export const sentBack = (context: WorkItemContext, decision: HumanDecision) => ({
  ...unblocked,
  ...returnedToSpec(context, decision),
  decisions: recordDecision(context, "backToSpec", "blocked", decision),
});

const overridden = (context: WorkItemContext, demo: boolean) => ({
  facts: factsAfter(context.facts, { _tag: "demoOverridden", demo }),
});

/** The context change when a human requires a demo in `state`: the requirement stands over any later plan. */
export const demoRequired = (context: WorkItemContext, state: string, decision: HumanDecision) => ({
  ...overridden(context, true),
  decisions: recordDecision(context, "requireDemo", state, decision),
});

/** The context change when a human skips a demo in `state`: the skip stands over any later plan. */
export const demoSkipped = (context: WorkItemContext, state: string, decision: HumanDecision) => ({
  ...overridden(context, false),
  decisions: recordDecision(context, "skipDemo", state, decision),
});

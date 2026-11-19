import type { Blocked } from "./blocked.ts";
import type { LoopCounts, LoopLimits } from "./loops.ts";
import type { Kind } from "./stage.ts";

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

export type DecisionAction = "approve" | "reject" | "retry" | "backToSpec" | "cancel";

export interface Decision {
  readonly action: DecisionAction;
  readonly state: string;
  readonly by: string;
  readonly at: string;
  readonly comment: string | null;
}

export interface WorkItemContext {
  readonly id: string;
  readonly issueRef: string;
  readonly kind: Kind | null;
  readonly limits: LoopLimits;
  readonly counters: LoopCounts;
  readonly demoPlanned: boolean;
  readonly feedback: string | null;
  /** The reference to the latest written spec; only the next written spec replaces it (ADR 0004). */
  readonly specRef: string | null;
  readonly blocked: Blocked | null;
  readonly decisions: readonly Decision[];
}

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
  feedback: decision.comment ?? null,
  decisions: recordDecision(context, "reject", gate, decision),
});

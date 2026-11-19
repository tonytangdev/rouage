import type { Blocked } from "./blocked.ts";
import type { Kind } from "./outcomes.ts";

export interface LoopLimits {
  readonly review: number;
  readonly reproduce: number;
}

/** How many times a work item has gone around each loop. */
export interface LoopCounts {
  readonly review: number;
  readonly reproduce: number;
}

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
  readonly blocked: Blocked | null;
  readonly decisions: readonly Decision[];
}

export const noLoopsYet: LoopCounts = { review: 0, reproduce: 0 };

export const recordDecision = (
  context: WorkItemContext,
  action: DecisionAction,
  state: string,
  { by, at, comment }: HumanDecision,
): readonly Decision[] => [
  ...context.decisions,
  { action, state, by, at, comment: comment ?? null },
];

/**
 * A gate: the work item waits for a human, moves to `approveTo` on approval,
 * and goes to `rejectTo` on rejection with the comment as feedback.
 */
export const gate = <Approve extends string, Reject extends string>(
  state: string,
  approveTo: Approve,
  rejectTo: Reject,
) => ({
  on: {
    approve: ({ context, event }: { context: WorkItemContext; event: HumanDecision }) => ({
      target: approveTo,
      context: { decisions: recordDecision(context, "approve", state, event) },
    }),
    reject: ({ context, event }: { context: WorkItemContext; event: HumanDecision }) => ({
      target: rejectTo,
      context: {
        feedback: event.comment ?? null,
        decisions: recordDecision(context, "reject", state, event),
      },
    }),
  },
});

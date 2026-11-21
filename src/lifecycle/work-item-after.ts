import { Match } from "effect";

import type { Blocked } from "./blocked.ts";
import { factsAfter } from "./facts.ts";
import { noLoopsYet } from "./loops.ts";
import type { Teaching } from "./outcome-teaching.ts";
import {
  blockingTaughtBy,
  exhaustedTeaching,
  nothingTaught,
  taughtBy,
} from "./outcome-teaching.ts";
import { failureReasonOf } from "./stage.ts";
import type { BlockingTransition, StageFinished, Transition } from "./transition.ts";
import type { DecisionAction, HumanDecision, WorkItemContext } from "./work-item.ts";

/** A work item's context while it is blocked, when the reason is always there. */
export interface BlockedContext extends WorkItemContext {
  readonly blocked: Blocked;
}

const decided = (
  context: WorkItemContext,
  action: DecisionAction,
  state: string,
  { by, at, comment }: HumanDecision,
): WorkItemContext => ({
  ...context,
  decisions: [...context.decisions, { action, state, by, at, comment: comment ?? null }],
});

const taught = (
  context: WorkItemContext,
  transition: Transition,
  teaching: Teaching = nothingTaught,
): WorkItemContext => ({ ...context, facts: factsAfter(context.facts, transition, teaching) });

const blockedWith = (context: WorkItemContext, blocked: Blocked): BlockedContext => ({
  ...context,
  blocked,
});

// Below the limit one more trip is counted; at the limit the work item is
// blocked on the looping stage, keeping what the outcome teaches beyond the
// trip, as a block keeps a reproduction (ADR 0009).
const finishedAfter = (context: WorkItemContext, transition: StageFinished): WorkItemContext => {
  const teaching = taughtBy(transition.outcome);
  if (teaching.blocks !== null) {
    const next = taught(context, transition, teaching);
    return blockedWith(next, { from: transition.stage, reason: teaching.blocks });
  }
  if (teaching.loops === null) {
    return taught(context, transition, teaching);
  }
  const { loop, describe } = teaching.loops;
  const limit = context.limits[loop];
  if (context.counters[loop] >= limit) {
    const next = taught(context, transition, exhaustedTeaching(teaching));
    return blockedWith(next, {
      from: loop,
      reason: { tag: "LoopLimitReached", message: describe(limit) },
    });
  }
  const next = taught(context, transition, teaching);
  return { ...next, counters: { ...next.counters, [loop]: next.counters[loop] + 1 } };
};

const unblocked = (context: WorkItemContext): WorkItemContext => ({
  ...context,
  blocked: null,
  counters: noLoopsYet,
});

/**
 * The work item's context after `transition`, the only way it changes: the
 * facts it teaches, the loop trip it counts, the block it causes and the human
 * decision it records. A transition that blocks the work item leaves `blocked`
 * set, which `blockedIn` narrows to pick the target.
 */
export const workItemAfter = (context: WorkItemContext, transition: Transition): WorkItemContext =>
  Match.valueTags(transition, {
    stageFinished: (finished) => finishedAfter(context, finished),
    stageErrored: (errored) => blockedAfter(context, errored),
    gateApproved: ({ gate, decision }) => decided(context, "approve", gate, decision),
    gateRejected: ({ gate, decision }) =>
      decided(taught(context, transition), "reject", gate, decision),
    retried: ({ decision }) =>
      decided(taught(unblocked(context), transition), "retry", "blocked", decision),
    sentBackToSpec: ({ decision }) =>
      decided(taught(unblocked(context), transition), "backToSpec", "blocked", decision),
    demoOverridden: ({ demo, state, decision }) =>
      decided(taught(context, transition), demo ? "requireDemo" : "skipDemo", state, decision),
    cancelled: ({ state, decision }) => decided(context, "cancel", state, decision),
  });

/** `workItemAfter` for a transition that always blocks the work item, typed for the Blocked state. */
export const blockedAfter = (
  context: WorkItemContext,
  transition: BlockingTransition,
): BlockedContext => {
  if (transition._tag === "stageErrored") {
    return blockedWith(context, {
      from: transition.stage,
      reason: failureReasonOf(transition.error),
    });
  }
  const teaching = blockingTaughtBy(transition.outcome);
  return blockedWith(taught(context, transition, teaching), {
    from: transition.stage,
    reason: teaching.blocks,
  });
};

/** `context` typed for the Blocked state when it is blocked, or `null` when it is not. */
export const blockedIn = (context: WorkItemContext): BlockedContext | null =>
  context.blocked === null ? null : blockedWith(context, context.blocked);

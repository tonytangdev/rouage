import { Match } from "effect";

import type { Blocked } from "./blocked.ts";
import { factsAfter } from "./facts.ts";
import { noLoopsYet } from "./loops.ts";
import type { BlockingTeaching, LoopTrip, Teaching } from "./outcome-teaching.ts";
import {
  blockingTaughtBy,
  exhaustedTeaching,
  isBlocking,
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

const withFacts = (
  context: WorkItemContext,
  transition: Transition,
  teaching: Teaching = nothingTaught,
): WorkItemContext => ({ ...context, facts: factsAfter(context.facts, transition, teaching) });

const blockedWith = (context: WorkItemContext, blocked: Blocked): BlockedContext => ({
  ...context,
  blocked,
});

const blockedOnOutcome = (
  context: WorkItemContext,
  transition: StageFinished,
  teaching: BlockingTeaching,
): BlockedContext =>
  blockedWith(withFacts(context, transition, teaching), {
    from: transition.stage,
    reason: teaching.blocks,
  });

// At the limit the work item is blocked on the looping stage rather than sent
// around again, and still learns what the outcome teaches beyond the trip, as
// a block keeps a reproduction (ADR 0009).
const aroundLoop = (
  context: WorkItemContext,
  transition: StageFinished,
  teaching: Teaching,
  { loop, describe }: LoopTrip,
): WorkItemContext => {
  const limit = context.limits[loop];
  if (context.counters[loop] >= limit) {
    return blockedWith(withFacts(context, transition, exhaustedTeaching(teaching)), {
      from: loop,
      reason: { tag: "LoopLimitReached", message: describe(limit) },
    });
  }
  const next = withFacts(context, transition, teaching);
  return { ...next, counters: { ...next.counters, [loop]: next.counters[loop] + 1 } };
};

const finishedAfter = (context: WorkItemContext, transition: StageFinished): WorkItemContext => {
  const teaching = taughtBy(transition.outcome);
  if (isBlocking(teaching)) {
    return blockedOnOutcome(context, transition, teaching);
  }
  return teaching.loop === null
    ? withFacts(context, transition, teaching)
    : aroundLoop(context, transition, teaching, teaching.loop);
};

const unblocked = (context: WorkItemContext): WorkItemContext => ({
  ...context,
  blocked: null,
  counters: noLoopsYet,
});

/**
 * The work item's context after `transition`: the facts it teaches, the loop
 * trip it counts, the block it causes and the human decision it records. It
 * and `blockedAfter` are the only ways the context changes. A transition that
 * blocks the work item leaves `blocked` set, which `blockedIn` narrows so the
 * lifecycle can pick its target.
 */
export const workItemAfter = (context: WorkItemContext, transition: Transition): WorkItemContext =>
  Match.valueTags(transition, {
    stageFinished: (finished) => finishedAfter(context, finished),
    stageErrored: (errored) => blockedAfter(context, errored),
    gateApproved: ({ gate, decision }) => decided(context, "approve", gate, decision),
    gateRejected: ({ gate, decision }) =>
      decided(withFacts(context, transition), "reject", gate, decision),
    retried: ({ decision }) =>
      decided(withFacts(unblocked(context), transition), "retry", "blocked", decision),
    sentBackToSpec: ({ decision }) =>
      decided(withFacts(unblocked(context), transition), "backToSpec", "blocked", decision),
    demoOverridden: ({ demo, state, decision }) =>
      decided(withFacts(context, transition), demo ? "requireDemo" : "skipDemo", state, decision),
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
  return blockedOnOutcome(context, transition, blockingTaughtBy(transition.outcome));
};

/** `context` typed for the Blocked state when it is blocked, or `null` when it is not. */
export const blockedIn = (context: WorkItemContext): BlockedContext | null =>
  context.blocked === null ? null : blockedWith(context, context.blocked);

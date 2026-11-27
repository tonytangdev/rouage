import { Match } from "effect";

import type { Blocked } from "./blocked.ts";
import { factsAfter } from "./facts.ts";
import { noLoopsYet } from "./loops.ts";
import type { BlockingTeaching, LoopingTeaching, Teaching } from "./outcome-teaching.ts";
import {
  exhaustedTeaching,
  isBlocking,
  isLooping,
  nothingTaught,
  taughtBy,
} from "./outcome-teaching.ts";
import type { Place } from "./place.ts";
import { failureReasonOf } from "./stage.ts";
import type {
  BlockingTransition,
  GateHandedOff,
  HumanTransition,
  LoopingTransition,
  StageErrored,
  StageFinished,
  OnwardTransition,
  Transition,
} from "./transition.ts";
import type { DecisionAction, HumanDecision, WorkItemContext } from "./work-item.ts";

/** A work item's context while it is blocked, when the reason is always there. */
export interface BlockedContext extends WorkItemContext {
  readonly blocked: Blocked;
}

const decided = (
  context: WorkItemContext,
  action: DecisionAction,
  state: Place,
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

/**
 * Where a looping outcome leaves the work item: sent around its loop, with
 * the context it goes `around` with, or `blocked` once the loop reached its
 * limit, with the context typed for the Blocked state.
 */
// Each case names its context differently, because a blocked context is a
// work item context too: under one name, routing it to a working state
// without narrowing would compile.
export type AroundLoop =
  | { readonly _tag: "sentAround"; readonly around: WorkItemContext }
  | { readonly _tag: "blocked"; readonly blocked: BlockedContext };

// At the limit the work item is blocked on the looping stage rather than sent
// around again, and still learns what the outcome teaches beyond the trip, as
// a block keeps a reproduction (ADR 0009).
const aroundLoop = (
  context: WorkItemContext,
  transition: StageFinished,
  teaching: LoopingTeaching,
): AroundLoop => {
  const { loop, describe } = teaching.loop;
  const limit = context.limits[loop];
  if (context.counters[loop] >= limit) {
    return {
      _tag: "blocked",
      blocked: blockedWith(withFacts(context, transition, exhaustedTeaching(teaching)), {
        from: loop,
        reason: { tag: "LoopLimitReached", message: describe(limit) },
      }),
    };
  }
  const next = withFacts(context, transition, teaching);
  return {
    _tag: "sentAround",
    around: { ...next, counters: { ...next.counters, [loop]: next.counters[loop] + 1 } },
  };
};

const finishedAfter = (
  context: WorkItemContext,
  transition: StageFinished,
): WorkItemContext | AroundLoop => {
  const teaching = taughtBy(transition.outcome);
  if (isBlocking(teaching)) {
    return blockedOnOutcome(context, transition, teaching);
  }
  return isLooping(teaching)
    ? aroundLoop(context, transition, teaching)
    : withFacts(context, transition, teaching);
};

const erroredAfter = (context: WorkItemContext, { stage, error }: StageErrored): BlockedContext =>
  blockedWith(context, { from: stage, reason: failureReasonOf(error) });

const handedOffAfter = (context: WorkItemContext, { gate, reason }: GateHandedOff) => ({
  ...context,
  handOff: { gate, reason },
});

const unblocked = (context: WorkItemContext): WorkItemContext => ({
  ...context,
  blocked: null,
  counters: noLoopsYet,
});

// A hand-off is read only while its gate waits, so a decision leaving the
// gate clears it, and a plugin's decision there never shows a stale reason.
const leftGate = (context: WorkItemContext): WorkItemContext => ({ ...context, handOff: null });

const decidedAfter = (context: WorkItemContext, transition: HumanTransition): WorkItemContext =>
  Match.valueTags(transition, {
    gateApproved: ({ gate, decision }) => decided(leftGate(context), "approve", gate, decision),
    gateRejected: ({ gate, decision }) =>
      decided(withFacts(leftGate(context), transition), "reject", gate, decision),
    retried: ({ decision }) =>
      decided(withFacts(unblocked(context), transition), "retry", "blocked", decision),
    sentBackToSpec: ({ decision }) =>
      decided(withFacts(unblocked(context), transition), "backToSpec", "blocked", decision),
    demoOverridden: ({ demo, state, decision }) =>
      decided(withFacts(context, transition), demo ? "requireDemo" : "skipDemo", state, decision),
    cancelled: ({ state, decision }) => decided(context, "cancel", state, decision),
  });

/**
 * The work item's context after `transition`: the facts it teaches, the loop
 * trip it counts, the block it causes, the hand-off a human reads and the
 * decision it records, by a human or a plugin gatekeeper; the only way the
 * context changes. Its type says whether the work item can be blocked: a
 * transition that never blocks gives the context, one that always blocks
 * gives it typed for the Blocked state, and an outcome that loops gives
 * `AroundLoop`, whose context is reached only by telling whether the loop
 * sent the work item around or blocked it at its limit.
 */
// TypeScript does not hold the implementation to these overloads; the
// teaching table does, because it types each outcome's tag as blocking,
// looping or neither, and the implementation branches on that teaching.
export function workItemAfter(
  context: WorkItemContext,
  transition: OnwardTransition,
): WorkItemContext;
export function workItemAfter(context: WorkItemContext, transition: LoopingTransition): AroundLoop;
export function workItemAfter(
  context: WorkItemContext,
  transition: BlockingTransition,
): BlockedContext;
export function workItemAfter(
  context: WorkItemContext,
  transition: Transition,
): WorkItemContext | AroundLoop {
  if (transition._tag === "stageFinished") {
    return finishedAfter(context, transition);
  }
  if (transition._tag === "gateHandedOff") {
    return handedOffAfter(context, transition);
  }
  return transition._tag === "stageErrored"
    ? erroredAfter(context, transition)
    : decidedAfter(context, transition);
}

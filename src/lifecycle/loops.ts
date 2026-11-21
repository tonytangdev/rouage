import { Config, Effect } from "effect";

import { blockedOn } from "./blocked.ts";
import { stageFinished } from "./facts.ts";
import type { OutcomeOf } from "./stage.ts";
import type { WorkItemContext } from "./work-item.ts";

/** Each loop is named after the stage that sends the work item back around it. */
export type LoopName = "review" | "reproduce";

export type LoopLimits = Readonly<Record<LoopName, number>>;

/** How many times a work item has gone around each loop. */
export type LoopCounts = Readonly<Record<LoopName, number>>;

interface LoopState {
  readonly limits: LoopLimits;
  readonly counters: LoopCounts;
}

interface Loop {
  readonly variable: string;
  readonly describe: (limit: number) => string;
}

const DEFAULT_LIMIT = 3;

const loops: Readonly<Record<LoopName, Loop>> = {
  review: {
    variable: "ROUAGE_MAX_REVIEW_LOOPS",
    describe: (limit) => `Review sent the change back to Build ${limit} times`,
  },
  reproduce: {
    variable: "ROUAGE_MAX_REPRODUCE_LOOPS",
    describe: (limit) => `Reproduce went back to Provision ${limit} times`,
  },
};

/** One value per loop, so every per-loop record is built from this one list of loops. */
export const perLoop = <A>(value: (loop: LoopName) => A): Readonly<Record<LoopName, A>> => ({
  review: value("review"),
  reproduce: value("reproduce"),
});

export const noLoopsYet: LoopCounts = perLoop(() => 0);

const limit = (loop: LoopName, override: number | undefined) =>
  override === undefined
    ? Config.Int(loops[loop].variable).pipe(Config.withDefault(DEFAULT_LIMIT))
    : Config.succeed(override);

/**
 * Resolves the loop limits for a new work item. An explicit option wins over
 * `ROUAGE_MAX_REVIEW_LOOPS` / `ROUAGE_MAX_REPRODUCE_LOOPS`, which win over 3.
 * Resolve once per work item and store the result, so a restart or a changed
 * variable never moves the limits of a work item already in flight.
 */
export const resolveLoopLimits = Effect.fnUntraced(function* (overrides: Partial<LoopLimits> = {}) {
  return yield* Config.all(perLoop((loop) => limit(loop, overrides[loop])));
});

/** Whether the work item has already gone around `loop` as many times as its limit allows. */
export const loopExhausted = (state: LoopState, loop: LoopName) =>
  state.counters[loop] >= state.limits[loop];

/**
 * The context change when the stage that names `loop` finishes with an
 * `outcome` that sends the work item back around it: the facts the outcome
 * teaches, and one more trip counted.
 */
export const wentAround = <Name extends LoopName>(
  context: WorkItemContext,
  loop: Name,
  outcome: OutcomeOf<Name>,
) => ({
  ...stageFinished(context, loop, outcome),
  counters: { ...context.counters, [loop]: context.counters[loop] + 1 },
});

/** The context change that blocks the work item on the stage that names an exhausted `loop`. */
export const loopLimitReached = (state: LoopState, loop: LoopName) =>
  blockedOn(loop, { tag: "LoopLimitReached", message: loops[loop].describe(state.limits[loop]) });

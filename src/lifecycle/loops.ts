import { Config, Effect, Schema } from "effect";

import { blockedOn } from "./blocked.ts";
import { stageFinished } from "./facts.ts";
import type { OutcomeOf } from "./stage.ts";
import type { WorkItemContext } from "./work-item.ts";

/** Each loop is named after the stage that sends the work item back around it. */
export type LoopName = "review" | "reproduce";

/** The tag of each loop's stage outcome that sends the work item back around it. */
interface LoopingTags {
  readonly review: "changesRequested";
  readonly reproduce: "needsSample";
}

type LoopingOutcome<Name extends LoopName> = Extract<
  OutcomeOf<Name>,
  { readonly _tag: LoopingTags[Name] }
>;

export type LoopLimits = Readonly<Record<LoopName, number>>;

/** How many times a work item has gone around each loop. */
export type LoopCounts = Readonly<Record<LoopName, number>>;

interface Loop<Name extends LoopName> {
  readonly variable: string;
  /** Why the work item is blocked once the loop reaches `limit`, told to the human with what the last outcome asked for. */
  readonly describe: (limit: number, outcome: LoopingOutcome<Name>) => string;
}

const DEFAULT_LIMIT = 3;

const loops: { readonly [Name in LoopName]: Loop<Name> } = {
  review: {
    variable: "ROUAGE_MAX_REVIEW_LOOPS",
    describe: (limit, { feedback }) =>
      `Review sent the change back to Build ${limit} times, and last asked: ${feedback}`,
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

/** A whole number for each loop, as the work item saves its loop limits and counters. */
export const PerLoopCount = Schema.Struct(perLoop(() => Schema.Int));

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

/**
 * The context change when the stage that names `loop` finishes with an
 * `outcome` that sends the work item back around it, and whether the loop is
 * exhausted, so the transition picks its target literal (ADR 0002). Either
 * way the facts the outcome teaches are kept, as a block keeps a reproduction
 * (ADR 0009). Below the limit one more trip is counted; at the limit the work
 * item is blocked with no feedback, because a retry re-runs the looping stage
 * itself, so what it asked for goes to the human in the block's message.
 */
export const aroundLoop = <Name extends LoopName>(
  context: WorkItemContext,
  loop: Name,
  outcome: LoopingOutcome<Name>,
) => {
  const taught = stageFinished(context, loop, outcome);
  const allowed = context.limits[loop];
  if (context.counters[loop] >= allowed) {
    const reason = { tag: "LoopLimitReached", message: loops[loop].describe(allowed, outcome) };
    return {
      exhausted: true as const,
      context: { facts: { ...taught.facts, feedback: null }, ...blockedOn(loop, reason) },
    };
  }
  return {
    exhausted: false as const,
    context: { ...taught, counters: { ...context.counters, [loop]: context.counters[loop] + 1 } },
  };
};

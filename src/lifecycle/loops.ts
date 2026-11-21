import { Config, Effect, Record, Schema } from "effect";

import { blockedOn } from "./blocked.ts";
import { finished, loopExhausted } from "./fact-event.ts";
import { factsAfter } from "./facts.ts";
import type { OutcomeOf, StageName } from "./stage.ts";
import type { WorkItemContext } from "./work-item.ts";

/** A loop, named after the stage that sends the work item back around it with the outcome tagged `tag`. */
interface Loop<Stage extends StageName, Tag extends OutcomeOf<Stage>["_tag"]> {
  readonly tag: Tag;
  readonly variable: string;
  /** Why the work item is blocked once the loop reaches `limit`, told to the human with what the last outcome asked for. */
  readonly describe: (limit: number, outcome: Extract<OutcomeOf<Stage>, { _tag: Tag }>) => string;
}

// Curried so the stage is named and the tag is inferred from the declaration.
const loopOf =
  <Stage extends StageName>() =>
  <Tag extends OutcomeOf<Stage>["_tag"]>(loop: Loop<Stage, Tag>) =>
    loop;

const loops = {
  review: loopOf<"review">()({
    tag: "changesRequested",
    variable: "ROUAGE_MAX_REVIEW_LOOPS",
    describe: (limit, { feedback }) =>
      `Review sent the change back to Build ${limit} times, and last asked: ${feedback}`,
  }),
  reproduce: loopOf<"reproduce">()({
    tag: "needsSample",
    variable: "ROUAGE_MAX_REPRODUCE_LOOPS",
    describe: (limit) => `Reproduce went back to Provision ${limit} times`,
  }),
};

type Loops = typeof loops;

/** Each loop is named after the stage that sends the work item back around it. */
export type LoopName = keyof Loops;

type LoopingOutcome<Name extends LoopName> = Extract<
  OutcomeOf<Name>,
  { readonly _tag: Loops[Name]["tag"] }
>;

export type LoopLimits = Readonly<Record<LoopName, number>>;

/** How many times a work item has gone around each loop. */
export type LoopCounts = Readonly<Record<LoopName, number>>;

const DEFAULT_LIMIT = 3;

/** One value per loop, so every per-loop record is built from the one list of loops. */
export const perLoop = <A>(value: (loop: LoopName) => A): Readonly<Record<LoopName, A>> =>
  Record.map(loops, (_loop, name) => value(name));

// The same loops seen key by key, so indexing with a generic loop name keeps
// each loop's outcome tied to its own block message.
const byName: { readonly [Name in LoopName]: Loop<Name, Loops[Name]["tag"]> } = loops;

export const noLoopsYet: LoopCounts = perLoop(() => 0);

/** A whole number for each loop, as the work item saves its loop limits and counters. */
export const PerLoopCount = Schema.Struct(perLoop(() => Schema.Int));

const limit = (loop: LoopName, override: number | undefined) =>
  override === undefined
    ? Config.Int(loops[loop].variable).pipe(Config.withDefault(DEFAULT_LIMIT))
    : Config.succeed(override);

/**
 * Resolves the loop limits for a new work item. An explicit option wins over
 * the loop's variable, such as `ROUAGE_MAX_REVIEW_LOOPS`, which wins over 3.
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
 * item is blocked, and what the outcome asked for goes to the human in the
 * block's message.
 */
export const aroundLoop = <Name extends LoopName>(
  context: WorkItemContext,
  loop: Name,
  outcome: LoopingOutcome<Name>,
) => {
  const allowed = context.limits[loop];
  if (context.counters[loop] >= allowed) {
    const reason = { tag: "LoopLimitReached", message: byName[loop].describe(allowed, outcome) };
    return {
      exhausted: true as const,
      context: {
        facts: factsAfter(context.facts, loopExhausted(loop, outcome)),
        ...blockedOn(loop, reason),
      },
    };
  }
  return {
    exhausted: false as const,
    context: {
      facts: factsAfter(context.facts, finished(outcome)),
      counters: { ...context.counters, [loop]: context.counters[loop] + 1 },
    },
  };
};

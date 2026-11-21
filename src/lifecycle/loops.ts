import { Config, Effect, Record, Schema } from "effect";

// Each loop's settings only; what sends the work item around a loop, and why
// it blocks at the limit, is the looping outcome's teaching.
const loops = {
  review: { variable: "ROUAGE_MAX_REVIEW_LOOPS" },
  reproduce: { variable: "ROUAGE_MAX_REPRODUCE_LOOPS" },
  ship: { variable: "ROUAGE_MAX_SHIP_LOOPS" },
};

type Loops = typeof loops;

/** Each loop is named after the stage that sends the work item back around it. */
export type LoopName = keyof Loops;

export type LoopLimits = Readonly<Record<LoopName, number>>;

/** How many times a work item has gone around each loop. */
export type LoopCounts = Readonly<Record<LoopName, number>>;

const DEFAULT_LIMIT = 3;

/** One value per loop, so every per-loop record is built from the one list of loops. */
export const perLoop = <A>(value: (loop: LoopName) => A): Readonly<Record<LoopName, A>> =>
  Record.map(loops, (_loop, name) => value(name));

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

import type { LoopName } from "./loops.ts";
import type { OutcomeOf, StageName } from "./stage.ts";

/** Any outcome of any stage; each tag belongs to exactly one stage, which the facts module checks at compile time. */
export type AnyOutcome = OutcomeOf<StageName>;

/** A gate whose rejection sends the work item back to the stage before it, rather than to Spec. */
export type RejectingGate = "sampleGate" | "shipGate";

/**
 * Every lifecycle transition that changes the work item's facts, one event
 * per transition. Approvals, cancellation and a stage error change no facts,
 * so they have no event.
 */
export type FactEvent =
  | { readonly _tag: "stageFinished"; readonly outcome: AnyOutcome }
  | { readonly _tag: "loopExhausted"; readonly outcome: AnyOutcome }
  | { readonly _tag: "gateRejected"; readonly gate: RejectingGate; readonly comment: string | null }
  | { readonly _tag: "returnedToSpec"; readonly comment: string | null }
  | { readonly _tag: "retried"; readonly comment: string | null }
  | { readonly _tag: "demoOverridden"; readonly demo: boolean };

type IsUnion<T, Whole = T> = T extends unknown ? ([Whole] extends [T] ? false : true) : never;

/** The stages whose stage machine has exactly one outcome. */
export type SoleOutcomeStage = {
  readonly [Stage in StageName]: true extends IsUnion<OutcomeOf<Stage>> ? never : Stage;
}[StageName];

/** A stage finishing with an outcome its transition routes on. */
export const finished = (outcome: AnyOutcome): FactEvent => ({ _tag: "stageFinished", outcome });

/**
 * `finished` for a stage with exactly one outcome, whose transition need not
 * match on the outcome's tag. Giving such a stage a second outcome fails to
 * compile at each call, so its transition is made to route by tag.
 */
export const soleOutcome = <Stage extends SoleOutcomeStage>(
  _stage: Stage,
  outcome: OutcomeOf<Stage>,
): FactEvent => finished(outcome);

/** A loop's stage finishing with the outcome that would send it around once more than its limit allows. */
export const loopExhausted = <Loop extends LoopName>(
  _loop: Loop,
  outcome: OutcomeOf<Loop>,
): FactEvent => ({ _tag: "loopExhausted", outcome });

/** The feedback Review gave when `event` is Review requesting changes, else `null`. */
export const changesRequestedIn = (event: { readonly outcome: AnyOutcome }): string | null =>
  event.outcome._tag === "changesRequested" ? event.outcome.feedback : null;

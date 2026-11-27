import type { PluginGate } from "./gatekeeper.ts";
import type { BlockingOutcome, LoopingOutcome, OnwardOutcome } from "./outcome-teaching.ts";
import type { Gate, Place } from "./place.ts";
import type { OutcomeOf, StageName } from "./stage.ts";
import type { HumanDecision } from "./work-item.ts";

/** Any outcome of any stage; each tag belongs to exactly one stage, which the outcome teaching checks at compile time. */
export type AnyOutcome = OutcomeOf<StageName>;

/** A stage machine finishing with one of its outcomes. */
export interface StageFinished<Outcome extends AnyOutcome = AnyOutcome> {
  readonly _tag: "stageFinished";
  readonly stage: StageName;
  readonly outcome: Outcome;
}

/** A stage machine failing or crashing instead of finishing. */
export interface StageErrored {
  readonly _tag: "stageErrored";
  readonly stage: StageName;
  readonly error: unknown;
}

/**
 * What happened to a work item, one variant per kind of lifecycle transition.
 * It names what happened only, so no transition can pick the wrong change:
 * what it does to the work item, such as counting a loop or blocking it, is
 * decided in one place, from the outcome's teaching.
 */
export type Transition =
  | StageFinished
  | StageErrored
  | { readonly _tag: "gateApproved"; readonly gate: Gate; readonly decision: HumanDecision }
  | { readonly _tag: "gateRejected"; readonly gate: Gate; readonly decision: HumanDecision }
  | { readonly _tag: "retried"; readonly decision: HumanDecision }
  | { readonly _tag: "sentBackToSpec"; readonly decision: HumanDecision }
  | {
      readonly _tag: "demoOverridden";
      readonly demo: boolean;
      readonly state: Place;
      readonly decision: HumanDecision;
    }
  | { readonly _tag: "cancelled"; readonly state: Place; readonly decision: HumanDecision }
  | GateHandedOff;

/** The plugin keeping `gate` leaving the decision to a human, for `reason`. */
export interface GateHandedOff {
  readonly _tag: "gateHandedOff";
  readonly gate: PluginGate;
  readonly reason: string;
}

/** A transition that always blocks the work item. */
export type BlockingTransition = StageErrored | StageFinished<BlockingOutcome>;

/** A transition that sends the work item around a loop, or blocks it once the loop reaches its limit. */
export type LoopingTransition = StageFinished<LoopingOutcome>;

/** A transition a decision makes, by a human or, at a gate, by its plugin gatekeeper; it never blocks the work item. */
export type HumanTransition = Exclude<Transition, StageFinished | StageErrored | GateHandedOff>;

/** A transition that never blocks the work item. */
export type OnwardTransition = HumanTransition | GateHandedOff | StageFinished<OnwardOutcome>;

type IsUnion<T, Whole = T> = T extends unknown ? ([Whole] extends [T] ? false : true) : never;

/** The stages whose stage machine has exactly one outcome. */
export type SoleOutcomeStage = {
  readonly [Stage in StageName]: true extends IsUnion<OutcomeOf<Stage>> ? never : Stage;
}[StageName];

/** `stage` finishing with `outcome`, keeping the outcome's own type. */
export const finished = <Stage extends StageName, Outcome extends OutcomeOf<Stage>>(
  stage: Stage,
  outcome: Outcome,
): StageFinished<Outcome> => ({ _tag: "stageFinished", stage, outcome });

/**
 * `finished` for a stage with exactly one outcome, whose transition need not
 * match on the outcome's tag. Giving such a stage a second outcome fails to
 * compile at each call, so its transition is made to route by tag.
 */
export const soleOutcome = <Stage extends SoleOutcomeStage>(
  stage: Stage,
  outcome: OutcomeOf<Stage>,
): StageFinished<OutcomeOf<Stage>> => finished(stage, outcome);

/** `stage` failing or crashing with `error` instead of finishing. */
export const errored = (stage: StageName, error: unknown): StageErrored => ({
  _tag: "stageErrored",
  stage,
  error,
});

/** Whether `transition` returns the work item to Spec to rewrite it: a spec gate rejection, or a blocked work item sent back. */
export const returnsToSpec = (transition: Transition): boolean =>
  transition._tag === "sentBackToSpec" ||
  (transition._tag === "gateRejected" && transition.gate === "specGate");

/** A human, or the plugin gatekeeper keeping `gate`, approving there. */
export const gateApproved = (gate: Gate, decision: HumanDecision): HumanTransition => ({
  _tag: "gateApproved",
  gate,
  decision,
});

/** A human, or the plugin gatekeeper keeping `gate`, rejecting there. */
export const gateRejected = (gate: Gate, decision: HumanDecision): HumanTransition => ({
  _tag: "gateRejected",
  gate,
  decision,
});

/** A human retrying the stage a blocked work item came from. */
export const retried = (decision: HumanDecision): HumanTransition => ({
  _tag: "retried",
  decision,
});

/** A human sending a blocked work item back to Spec. */
export const sentBackToSpec = (decision: HumanDecision): HumanTransition => ({
  _tag: "sentBackToSpec",
  decision,
});

/** A human requiring (`demo: true`) or skipping a demo while the work item is in `state`. */
export const demoOverridden = (
  demo: boolean,
  state: Place,
  decision: HumanDecision,
): HumanTransition => ({ _tag: "demoOverridden", demo, state, decision });

/** A human cancelling the work item while it is in `state`. */
export const cancelled = (state: Place, decision: HumanDecision): HumanTransition => ({
  _tag: "cancelled",
  state,
  decision,
});

/** The plugin keeping `gate` leaving the decision to a human, for `reason`, as a hand-off or by giving up. */
export const gateHandedOff = (gate: PluginGate, reason: string): GateHandedOff => ({
  _tag: "gateHandedOff",
  gate,
  reason,
});

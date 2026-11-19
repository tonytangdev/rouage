import { Data } from "effect";

export type Kind = "bug" | "feature";

/** Why a stage could not finish, as plain data so it survives persistence. */
export interface FailureReason {
  readonly tag: string;
  readonly message: string;
}

/**
 * What a stage machine fails with when it cannot finish. Any other error from
 * a stage is treated as a crash.
 */
export class StageFailure extends Data.TaggedError("StageFailure")<{
  readonly reason: FailureReason;
}> {}

export interface IntakeOutcome {
  readonly _tag: "classified";
  readonly kind: Kind;
}
export interface SpecOutcome {
  readonly _tag: "written";
}
export interface ProvisionOutcome {
  readonly _tag: "provisioned";
}
export type ReproduceOutcome =
  | { readonly _tag: "reproduced" }
  | { readonly _tag: "needsSample" }
  | { readonly _tag: "cannotReproduce"; readonly reason: string };
export interface PlanOutcome {
  readonly _tag: "planned";
  readonly demo: boolean;
}
export interface BuildOutcome {
  readonly _tag: "built";
}
export interface DemoOutcome {
  readonly _tag: "demonstrated";
}
export type ReviewOutcome =
  | { readonly _tag: "approved" }
  | { readonly _tag: "changesRequested"; readonly feedback: string };
export interface ShipOutcome {
  readonly _tag: "shipped";
}

/** What the lifecycle passes to every stage machine it starts. */
export interface StageInput {
  readonly workItemId: string;
  readonly kind: Kind | null;
  readonly feedback: string | null;
}

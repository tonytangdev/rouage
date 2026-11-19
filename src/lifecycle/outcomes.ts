export type Kind = "bug" | "feature";

/** Why a stage could not finish, as plain data so it survives persistence. */
export interface FailureReason {
  readonly tag: string;
  readonly message: string;
}

export interface Failed {
  readonly _tag: "failed";
  readonly reason: FailureReason;
}

export type IntakeOutcome = { readonly _tag: "classified"; readonly kind: Kind } | Failed;
export type SpecOutcome = { readonly _tag: "written" } | Failed;
export type ProvisionOutcome = { readonly _tag: "provisioned" } | Failed;
export type ReproduceOutcome =
  | { readonly _tag: "reproduced" }
  | { readonly _tag: "needsSample" }
  | { readonly _tag: "cannotReproduce"; readonly reason: string }
  | Failed;
export type PlanOutcome = { readonly _tag: "planned"; readonly demo: boolean } | Failed;
export type BuildOutcome = { readonly _tag: "built" } | Failed;
export type DemoOutcome = { readonly _tag: "demonstrated" } | Failed;
export type ReviewOutcome =
  | { readonly _tag: "approved" }
  | { readonly _tag: "changesRequested"; readonly feedback: string }
  | Failed;
export type ShipOutcome = { readonly _tag: "shipped" } | Failed;

/** What the lifecycle passes to every stage machine it starts. */
export interface StageInput {
  readonly workItemId: string;
  readonly kind: Kind | null;
  readonly feedback: string | null;
}

import { Data, Predicate } from "effect";

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

/** The reason a stage's error blocks the work item: its `StageFailure` reason, or `StageCrashed` for any other error. */
export const failureReasonOf = (error: unknown): FailureReason => {
  if (error instanceof StageFailure) {
    return error.reason;
  }
  return {
    tag: "StageCrashed",
    message: Predicate.isError(error) ? error.message : String(error),
  };
};

/** What the lifecycle passes to every stage machine it starts. */
export interface StageInput {
  readonly workItemId: string;
  readonly issueRef: string;
  readonly kind: Kind | null;
  readonly feedback: string | null;
  /** The reference to the latest written spec, opaque to Rouage (ADR 0004). */
  readonly specRef: string | null;
}

interface StageInputSource {
  readonly id: string;
  readonly issueRef: string;
  readonly kind: Kind | null;
  readonly feedback: string | null;
  readonly specRef: string | null;
}

/** Builds a stage's input from the work item; takes XState's input-function argument so it can be passed as is. */
export const stageInput = ({ context }: { readonly context: StageInputSource }): StageInput => ({
  workItemId: context.id,
  issueRef: context.issueRef,
  kind: context.kind,
  feedback: context.feedback,
  specRef: context.specRef,
});

/**
 * Each stage of the default lifecycle and the outcome its stage machine
 * finishes with. A stage implementation fits a slot when it accepts
 * `StageInput` and finishes with that slot's outcome.
 */
export interface StageOutcomes {
  readonly intake: { readonly _tag: "classified"; readonly kind: Kind };
  readonly spec: { readonly _tag: "written"; readonly specRef: string };
  readonly provision: { readonly _tag: "provisioned" };
  readonly reproduce:
    | { readonly _tag: "reproduced" }
    | { readonly _tag: "needsSample" }
    | { readonly _tag: "cannotReproduce"; readonly reason: string };
  readonly plan: { readonly _tag: "planned"; readonly demo: boolean };
  readonly build: { readonly _tag: "built" };
  readonly demo: { readonly _tag: "demonstrated" };
  readonly review:
    | { readonly _tag: "approved" }
    | { readonly _tag: "changesRequested"; readonly feedback: string };
  readonly ship: { readonly _tag: "shipped" };
}

export type StageName = keyof StageOutcomes;

export type OutcomeOf<Stage extends StageName> = StageOutcomes[Stage];

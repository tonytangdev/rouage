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

/** What the work item holds that every stage sees. */
export interface StageFacts {
  readonly issueRef: string;
  readonly kind: Kind | null;
  /** A human's comment for the stage the work item returns to, set by a rejection or a return from Blocked. */
  readonly feedback: string | null;
  /** The reference to the latest written spec, opaque to Rouage; only the next written spec replaces it (ADR 0004). */
  readonly specRef: string | null;
  /** The reference to the work item's sandbox, opaque to Rouage; set by Provision (ADR 0004). */
  readonly sandboxRef: string | null;
  /** Reproduce's description of the data a bug needs, which Provision takes a sample of; never cleared (ADR 0005). */
  readonly sampleRequest: string | null;
  /** The reference to the sample Provision took into the sandbox, opaque to Rouage (ADR 0004). */
  readonly sampleRef: string | null;
  /** The reference to the bug's reproduction, opaque to Rouage; only the next reproduction replaces it (ADR 0004, ADR 0006). */
  readonly reproductionRef: string | null;
  /** The reference to the latest plan, opaque to Rouage; only the next plan replaces it (ADR 0004). */
  readonly planRef: string | null;
  /** Whether the latest plan calls for a demo, or `null` before Plan has run. */
  readonly demoPlanned: boolean | null;
  /** The reference to the latest demo, opaque to Rouage; only the next demo replaces it (ADR 0004), so it shows the current change only while the latest plan calls for a demo. */
  readonly demoRef: string | null;
}

/** The facts of a work item no stage has worked on yet; only `issueRef` is known from the start. */
export const noFactsYet: Omit<StageFacts, "issueRef"> = {
  kind: null,
  feedback: null,
  specRef: null,
  sandboxRef: null,
  sampleRequest: null,
  sampleRef: null,
  reproductionRef: null,
  planRef: null,
  demoPlanned: null,
  demoRef: null,
};

/** What the lifecycle passes to every stage machine it starts. */
export interface StageInput extends StageFacts {
  readonly workItemId: string;
}

/** Builds a stage's input from the work item; takes XState's input-function argument so it can be passed as is. */
export const stageInput = ({
  context: { id, facts },
}: {
  readonly context: { readonly id: string; readonly facts: StageFacts };
}): StageInput => ({ workItemId: id, ...facts });

/**
 * Each stage of the default lifecycle and the outcome its stage machine
 * finishes with. A stage implementation fits a slot when it accepts
 * `StageInput` and finishes with that slot's outcome.
 */
export interface StageOutcomes {
  readonly intake: { readonly _tag: "classified"; readonly kind: Kind };
  readonly spec: { readonly _tag: "written"; readonly specRef: string };
  readonly provision: {
    readonly _tag: "provisioned";
    readonly sandboxRef: string;
    readonly sampleRef: string | null;
  };
  readonly reproduce:
    | { readonly _tag: "reproduced"; readonly reproductionRef: string }
    | { readonly _tag: "needsSample"; readonly sampleRequest: string }
    | { readonly _tag: "cannotReproduce"; readonly reason: string };
  readonly plan: { readonly _tag: "planned"; readonly planRef: string; readonly demo: boolean };
  readonly build: { readonly _tag: "built" };
  readonly demo: { readonly _tag: "demonstrated"; readonly demoRef: string };
  readonly review:
    | { readonly _tag: "approved" }
    | { readonly _tag: "changesRequested"; readonly feedback: string };
  readonly ship: { readonly _tag: "shipped" };
}

export type StageName = keyof StageOutcomes;

export type OutcomeOf<Stage extends StageName> = StageOutcomes[Stage];

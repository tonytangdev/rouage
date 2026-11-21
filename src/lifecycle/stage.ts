import { Data, Predicate, Schema } from "effect";

export const KindSchema = Schema.Literals(["bug", "feature"]);
export type Kind = typeof KindSchema.Type;

/** Every stage of the default lifecycle; `StageOutcomes` gives each its outcome. */
export const StageNameSchema = Schema.Literals([
  "intake",
  "spec",
  "provision",
  "reproduce",
  "plan",
  "build",
  "demo",
  "review",
  "ship",
]);
export type StageName = typeof StageNameSchema.Type;

/** Why a stage could not finish, as plain data so it survives persistence. */
export const FailureReasonSchema = Schema.Struct({ tag: Schema.String, message: Schema.String });
export type FailureReason = typeof FailureReasonSchema.Type;

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

const Reference = Schema.NullOr(Schema.String);

/** What the work item holds that every stage sees. */
export const StageFactsSchema = Schema.Struct({
  issueRef: Schema.String,
  kind: Schema.NullOr(KindSchema),
  /** A comment for the next stage to finish, set by a rejection, a return from Blocked or Review's requested changes, and cleared when any stage finishes. */
  feedback: Reference,
  /** The reference to the latest written spec, opaque to Rouage; only the next written spec replaces it (ADR 0004). */
  specRef: Reference,
  /** The reference to the work item's sandbox, opaque to Rouage; set by Provision (ADR 0004). */
  sandboxRef: Reference,
  /** Reproduce's description of the data a bug needs, which Provision takes a sample of; never cleared (ADR 0005). */
  sampleRequest: Reference,
  /** The reference to the sample Provision took into the sandbox, opaque to Rouage (ADR 0004). */
  sampleRef: Reference,
  /** The reference to the bug's reproduction, opaque to Rouage; only the next reproduction replaces it (ADR 0004, ADR 0006). */
  reproductionRef: Reference,
  /** The reference to the latest plan, opaque to Rouage; only the next plan replaces it (ADR 0004). */
  planRef: Reference,
  /** Whether the latest plan calls for a demo, or `null` before Plan has run. */
  demoPlanned: Schema.NullOr(Schema.Boolean),
  /** The reference to the latest demo, opaque to Rouage; only the next demo replaces it (ADR 0004). */
  demoRef: Reference,
  /** The reference to where Ship delivered the change, opaque to Rouage (ADR 0004); `null` until shipped. */
  deliveryRef: Reference,
});
export type StageFacts = typeof StageFactsSchema.Type;

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
  deliveryRef: null,
};

/** What the lifecycle passes to every stage machine it starts. */
export interface StageInput extends StageFacts {
  readonly workItemId: string;
  /** The demo of the current change, or `null` when the latest plan calls for none, because a demo made for an earlier plan no longer shows the change. */
  readonly demoRef: string | null;
}

/** Builds a stage's input from the work item; takes XState's input-function argument so it can be passed as is. */
export const stageInput = ({
  context: { id, facts },
}: {
  readonly context: { readonly id: string; readonly facts: StageFacts };
}): StageInput => ({
  workItemId: id,
  ...facts,
  demoRef: facts.demoPlanned === true ? facts.demoRef : null,
});

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
  readonly ship: { readonly _tag: "shipped"; readonly deliveryRef: string };
}

export type OutcomeOf<Stage extends StageName> = StageOutcomes[Stage];

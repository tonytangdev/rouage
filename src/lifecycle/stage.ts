import { Data, Predicate, Schema, Struct } from "effect";

import type { DemoFacts } from "./demo-decision.ts";
import {
  DemoFactsSchema,
  demoFactNames,
  demoShown,
  demoToRevise,
  noDemoYet,
} from "./demo-decision.ts";

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

/** What the work item holds that every stage sees, except the demo facts, which stages see only through `StageInput.demoRef`. */
export const StageFactsSchema = Schema.Struct({
  issueRef: Schema.String,
  kind: Schema.NullOr(KindSchema),
  /** A comment for the next stage to finish, set by a rejection, a retry or return to Spec with a comment, or Review's requested changes, and cleared when any stage finishes. */
  feedback: Reference,
  /** The reference to the latest written spec, opaque to Rouage; only the next written spec replaces it (ADR 0004). */
  specRef: Reference,
  /** The reference to the work item's sandbox, opaque to Rouage; set by Provision (ADR 0004). */
  sandboxRef: Reference,
  /** Reproduce's description of the data a bug needs, which Provision takes a sample of; never cleared (ADR 0005). */
  sampleRequest: Reference,
  /** The reference to the sample Provision took into the sandbox, opaque to Rouage (ADR 0004). */
  sampleRef: Reference,
  /** The reference to the latest extraction script the user was asked to run, opaque to Rouage; only the next script replaces it (ADR 0004, ADR 0008). */
  scriptRef: Reference,
  /** The reference to the bug's latest captured reproduction, opaque to Rouage; confirmed failing only once Reproduce finishes with `reproduced`, and only the next reproduction replaces it (ADR 0004, ADR 0006, ADR 0009). */
  reproductionRef: Reference,
  /** The reference to the latest plan, opaque to Rouage; only the next plan replaces it (ADR 0004). */
  planRef: Reference,
  ...DemoFactsSchema.fields,
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
  scriptRef: null,
  reproductionRef: null,
  planRef: null,
  ...noDemoYet,
  deliveryRef: null,
};

/**
 * What the lifecycle passes to every stage machine it starts: the work item's
 * facts, with the demo decision reduced to the one demo the stage may see,
 * because a stage reading the raw demo facts could disagree with the lifecycle
 * on whether a demo is called for (ADR 0011).
 */
export interface StageInput extends Omit<StageFacts, keyof DemoFacts> {
  readonly workItemId: string;
  /** The demo of the current change, or `null` when there is none to show. */
  readonly demoRef: string | null;
}

interface InputArgument {
  readonly context: { readonly id: string; readonly facts: StageFacts };
}

const inputWith = (
  { context: { id, facts } }: InputArgument,
  demoRef: string | null,
): StageInput => ({
  workItemId: id,
  ...Struct.omit(facts, demoFactNames),
  demoRef,
});

/** Builds a stage's input from the work item; takes XState's input-function argument so it can be passed as is. */
export const stageInput = (argument: InputArgument): StageInput =>
  inputWith(argument, demoShown(argument.context.facts));

/** `stageInput` for Demo, which gets the demo to revise. */
export const demoStageInput = (argument: InputArgument): StageInput =>
  inputWith(argument, demoToRevise(argument.context.facts));

/**
 * Each stage of the default lifecycle and the outcome its stage machine
 * finishes with. A stage implementation fits a slot when it accepts
 * `StageInput` and finishes with that slot's outcome.
 */
export interface StageOutcomes {
  readonly intake: { readonly _tag: "classified"; readonly kind: Kind };
  readonly spec: { readonly _tag: "written"; readonly specRef: string };
  readonly provision:
    | {
        readonly _tag: "provisioned";
        readonly sandboxRef: string;
        readonly sampleRef: string | null;
      }
    | { readonly _tag: "awaitingRun"; readonly sandboxRef: string; readonly scriptRef: string };
  readonly reproduce:
    | { readonly _tag: "reproduced"; readonly reproductionRef: string }
    | { readonly _tag: "needsSample"; readonly sampleRequest: string }
    | { readonly _tag: "cannotReproduce"; readonly reason: string }
    | { readonly _tag: "checkPassed"; readonly reproductionRef: string; readonly output: string };
  readonly plan: { readonly _tag: "planned"; readonly planRef: string; readonly demo: boolean };
  readonly build: { readonly _tag: "built" };
  readonly demo: { readonly _tag: "demonstrated"; readonly demoRef: string };
  readonly review:
    | { readonly _tag: "approved" }
    | { readonly _tag: "changesRequested"; readonly feedback: string };
  readonly ship: { readonly _tag: "shipped"; readonly deliveryRef: string };
}

export type OutcomeOf<Stage extends StageName> = StageOutcomes[Stage];

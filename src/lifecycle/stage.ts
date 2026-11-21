import { Data, Predicate, Schema, Struct } from "effect";

import { demoFactNames, demoShown, demoToRevise } from "./demo-decision.ts";
import type { StageFacts } from "./facts.ts";
import { StageFactsSchema } from "./facts.ts";
import type { Kind } from "./kind.ts";

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

/**
 * What the lifecycle passes to every stage machine it starts: the work item's
 * facts, with the demo decision reduced to the one demo the stage may see,
 * because a stage reading the raw demo facts could disagree with the lifecycle
 * on whether a demo is called for (ADR 0011). A Schema, so a stage machine
 * that keeps its input in its context can check a restored one (ADR 0014).
 */
export const StageInputSchema = Schema.Struct({
  workItemId: Schema.String,
  ...Struct.omit(StageFactsSchema.fields, demoFactNames),
  /** The demo of the current change, or `null` when there is none to show. */
  demoRef: Schema.NullOr(Schema.String),
});
export type StageInput = typeof StageInputSchema.Type;

/** The `StageInput` Schema as the Standard Schema a stage machine declares its context with, when its context is its input. */
export const stageInputContext = Schema.toStandardSchemaV1(StageInputSchema);

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

const shownInput = (argument: InputArgument): StageInput =>
  inputWith(argument, demoShown(argument.context.facts));

/**
 * The input the lifecycle gives each stage, built from the work item. Each
 * takes XState's input-function argument so a state can pass it as is. Demo
 * alone gets the demo to revise, even when outdated (ADR 0011).
 */
export const stageInputs: Readonly<Record<StageName, (argument: InputArgument) => StageInput>> = {
  intake: shownInput,
  spec: shownInput,
  provision: shownInput,
  reproduce: shownInput,
  plan: shownInput,
  build: shownInput,
  demo: (argument) => inputWith(argument, demoToRevise(argument.context.facts)),
  review: shownInput,
  ship: shownInput,
};

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
  readonly ship:
    | { readonly _tag: "shipped"; readonly deliveryRef: string }
    | { readonly _tag: "needsRebuild"; readonly feedback: string };
}

export type OutcomeOf<Stage extends StageName> = StageOutcomes[Stage];

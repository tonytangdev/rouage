import type { Effect } from "effect";
import { Context, Data, Schema } from "effect";

import { RunBriefSchema } from "../run-brief.ts";

export const CaptureTaskSchema = Schema.Struct({
  ...RunBriefSchema.fields,
  issueRef: Schema.String,
  specRef: Schema.NullOr(Schema.String),
  sandboxRef: Schema.String,
  /** The sample Provision took into the sandbox, or null when none was taken. */
  sampleRef: Schema.NullOr(Schema.String),
  /** The data this reproducer asked for before, or null when it has not asked. */
  sampleRequest: Schema.NullOr(Schema.String),
  /** The reproduction captured before, for the reproducer to revise; null on the first capture. */
  previousReproductionRef: Schema.NullOr(Schema.String),
});
export type CaptureTask = typeof CaptureTaskSchema.Type;

/**
 * The reproducer's answer: a reference to the reproduction it stored,
 * `needsSample` when the bug depends on data the sandbox does not hold, or
 * `cannotReproduce` when the bug does not show with the data it needs.
 */
export type Captured =
  | { readonly _tag: "captured"; readonly reproductionRef: string }
  | { readonly _tag: "needsSample"; readonly sampleRequest: string }
  | { readonly _tag: "cannotReproduce"; readonly reason: string };

export const ConfirmTaskSchema = Schema.Struct({
  workItemId: Schema.String,
  sandboxRef: Schema.String,
  reproductionRef: Schema.String,
});
export type ConfirmTask = typeof ConfirmTaskSchema.Type;

/** Whether the reproduction's check failed, showing the bug, or passed, with what it printed. */
export type Confirmation =
  | { readonly _tag: "failed" }
  | { readonly _tag: "passed"; readonly output: string };

/** The reproducer could not capture or run a reproduction at all, as opposed to the bug not showing. */
export class ReproducerGaveUp extends Data.TaggedError("ReproducerGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Reproduce stage captures a bug's reproduction through: a
 * check, stored where the reproducer chooses behind an opaque reference
 * (ADR 0004), that can be run again and fails while the bug exists.
 * `confirm` runs that check in the sandbox (ADR 0006). Usually filled by an
 * Agent plugin.
 */
export class Reproducer extends Context.Service<
  Reproducer,
  {
    readonly capture: (task: CaptureTask) => Effect.Effect<Captured, ReproducerGaveUp>;
    readonly confirm: (task: ConfirmTask) => Effect.Effect<Confirmation, ReproducerGaveUp>;
  }
>()("rouage/stages/reproduce/Reproducer") {}

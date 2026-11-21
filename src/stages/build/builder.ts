import type { Effect } from "effect";
import { Context, Data, Schema } from "effect";

import { ChangeRequestSchema } from "../../lifecycle/change-request.ts";
import { RunBriefSchema } from "../run-brief.ts";

export const BuildTaskSchema = Schema.Struct({
  ...RunBriefSchema.fields,
  /** The plan to follow, or null when the lifecycle runs no Plan before Build. */
  planRef: Schema.NullOr(Schema.String),
  /** The bug's reproduction, confirmed failing before the change; null for a feature. */
  reproductionRef: Schema.NullOr(Schema.String),
  /** What the change was last sent back to address, which outlives this run's feedback (ADR 0012); null until the change is first sent back, and again after a return to Spec. When it comes `from: "ship"`, the builder brings the change up to date with its target first (ADR 0013). */
  changeRequest: Schema.NullOr(ChangeRequestSchema),
});
export type BuildTask = typeof BuildTaskSchema.Type;

/** A bug's reproduction to run in the sandbox holding the change. */
export const ReproductionCheckTaskSchema = Schema.Struct({
  workItemId: Schema.String,
  sandboxRef: Schema.String,
  reproductionRef: Schema.String,
});
export type ReproductionCheckTask = typeof ReproductionCheckTaskSchema.Type;

export const FixTaskSchema = Schema.Struct({ workItemId: Schema.String, failures: Schema.String });
export type FixTask = typeof FixTaskSchema.Type;

export type TestReport =
  | { readonly _tag: "passed" }
  | { readonly _tag: "failed"; readonly failures: string };

/** Whether a bug's reproduction passed after the change, or still failed, with what it printed. */
export type ReproductionCheck = TestReport;

/** The builder could not carry out a step. */
export class BuilderGaveUp extends Data.TaggedError("BuilderGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Build stage runs its steps through: it changes a work item's
 * code, runs its tests and, for a bug, runs the reproduction in the sandbox,
 * which Build trusts only through `checkReproduction` (ADR 0010). Usually
 * filled by an Agent plugin.
 */
export class Builder extends Context.Service<
  Builder,
  {
    readonly implement: (task: BuildTask) => Effect.Effect<void, BuilderGaveUp>;
    readonly test: (task: BuildTask) => Effect.Effect<TestReport, BuilderGaveUp>;
    readonly fix: (task: FixTask) => Effect.Effect<void, BuilderGaveUp>;
    readonly checkReproduction: (
      task: ReproductionCheckTask,
    ) => Effect.Effect<ReproductionCheck, BuilderGaveUp>;
  }
>()("rouage/stages/build/Builder") {}

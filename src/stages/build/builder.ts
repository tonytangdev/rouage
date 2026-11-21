import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { ChangeRequest } from "../../lifecycle/change-request.ts";
import type { RunBrief } from "../run-brief.ts";

export interface BuildTask extends RunBrief {
  /** The plan to follow, or `null` when the lifecycle runs no Plan before Build. */
  readonly planRef: string | null;
  /** The bug's reproduction, confirmed failing before the change; `null` for a feature. */
  readonly reproductionRef: string | null;
  /** What the change was last sent back to address, which outlives this run's feedback (ADR 0012); `null` on a first build. */
  readonly changeRequest: ChangeRequest | null;
}

/** A bug's reproduction to run in the sandbox holding the change. */
export interface ReproductionCheckTask {
  readonly workItemId: string;
  readonly sandboxRef: string;
  readonly reproductionRef: string;
}

export interface FixTask {
  readonly workItemId: string;
  readonly failures: string;
}

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

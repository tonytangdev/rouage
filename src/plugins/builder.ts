import type { Effect } from "effect";
import { Context, Data } from "effect";

export interface BuildTask {
  readonly workItemId: string;
  readonly feedback: string | null;
}

export interface FixTask {
  readonly workItemId: string;
  readonly failures: string;
}

export type TestReport =
  | { readonly _tag: "passed" }
  | { readonly _tag: "failed"; readonly failures: string };

/** The builder could not carry out a task. */
export class BuildFailed extends Data.TaggedError("BuildFailed")<{
  readonly message: string;
}> {}

/** The port the Build stage runs its steps through: it changes a work item's code and runs its tests. Usually filled by an Agent plugin. */
export class Builder extends Context.Service<
  Builder,
  {
    readonly implement: (task: BuildTask) => Effect.Effect<void, BuildFailed>;
    readonly test: (task: BuildTask) => Effect.Effect<TestReport, BuildFailed>;
    readonly fix: (task: FixTask) => Effect.Effect<void, BuildFailed>;
  }
>()("rouage/plugins/Builder") {}

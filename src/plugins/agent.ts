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

/** The agent could not carry out a task. */
export class AgentFailed extends Data.TaggedError("AgentFailed")<{
  readonly message: string;
}> {}

/** An AI plugin that changes a work item's code and runs its tests. */
export class Agent extends Context.Service<
  Agent,
  {
    readonly implement: (task: BuildTask) => Effect.Effect<void, AgentFailed>;
    readonly test: (task: BuildTask) => Effect.Effect<TestReport, AgentFailed>;
    readonly fix: (task: FixTask) => Effect.Effect<void, AgentFailed>;
  }
>()("rouage/plugins/Agent") {}

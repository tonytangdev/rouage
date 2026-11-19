import type { Effect } from "effect";
import { Context, Data } from "effect";

/** What the agent is asked to build: the work item, and any feedback from a reviewer to address. */
export interface BuildTask {
  readonly workItemId: string;
  readonly feedback: string | null;
}

/** What the agent is asked to fix: the work item and the failures its last test run reported. */
export interface FixTask {
  readonly workItemId: string;
  readonly failures: string;
}

export type TestReport =
  | { readonly _tag: "passed" }
  | { readonly _tag: "failed"; readonly failures: string };

/** The agent could not carry out a task, such as when it timed out or exited. */
export class AgentFailed extends Data.TaggedError("AgentFailed")<{
  readonly message: string;
}> {}

/** An AI plugin that changes code and runs its tests in the work item's sandbox. */
export class Agent extends Context.Service<
  Agent,
  {
    readonly implement: (task: BuildTask) => Effect.Effect<void, AgentFailed>;
    readonly test: (task: BuildTask) => Effect.Effect<TestReport, AgentFailed>;
    readonly fix: (task: FixTask) => Effect.Effect<void, AgentFailed>;
  }
>()("rouage/plugins/Agent") {}

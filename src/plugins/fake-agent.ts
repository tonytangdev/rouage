import { Deferred, Effect, Layer } from "effect";

import type { BuildTask, FixTask, TestReport } from "./agent.ts";
import { Agent, AgentFailed } from "./agent.ts";

export type AgentStep = "implement" | "test" | "fix";

/** One request the agent received, with the task it was given. */
export type AgentCall =
  | { readonly step: "implement"; readonly task: BuildTask }
  | { readonly step: "test"; readonly task: BuildTask }
  | { readonly step: "fix"; readonly task: FixTask };

export interface FakeAgentScript {
  /** What each test run reports, in order. */
  readonly testReports: readonly TestReport[];
  /** A step that fails with `AgentFailed` every time it runs. */
  readonly failing?: AgentStep;
  /** A step that dies with a defect every time it runs. */
  readonly crashing?: AgentStep;
  /** A step that never finishes, so a test can stop the work item while it runs. */
  readonly hanging?: AgentStep;
}

const outcomeOf = <A>(script: FakeAgentScript, step: AgentStep, result: Effect.Effect<A>) => {
  if (script.failing === step) {
    return Effect.fail(new AgentFailed({ message: `The agent gave up during ${step}` }));
  }
  if (script.crashing === step) {
    return Effect.die(new Error(`The agent exited during ${step}`));
  }
  return script.hanging === step ? Effect.never : result;
};

/**
 * An agent that follows a script instead of calling an AI. A test run beyond
 * the script dies, so a test that under-scripts its agent fails loudly.
 */
export const fakeAgent = Effect.fnUntraced(function* (script: FakeAgentScript) {
  const calls: AgentCall[] = [];
  const reports = [...script.testReports];
  const begun = {
    implement: yield* Deferred.make<AgentStep>(),
    test: yield* Deferred.make<AgentStep>(),
    fix: yield* Deferred.make<AgentStep>(),
  };
  const run = <A>(call: AgentCall, result: Effect.Effect<A>) =>
    Effect.suspend(() => {
      calls.push(call);
      return Deferred.succeed(begun[call.step], call.step).pipe(
        Effect.andThen(outcomeOf(script, call.step, result)),
      );
    });
  const nextReport = Effect.suspend(() => {
    const report = reports.shift();
    return report === undefined
      ? Effect.die(new Error("The fake agent ran out of scripted test reports"))
      : Effect.succeed(report);
  });
  const agent = Agent.of({
    implement: (task) => run({ step: "implement", task }, Effect.void),
    test: (task) => run({ step: "test", task }, nextReport),
    fix: (task) => run({ step: "fix", task }, Effect.void),
  });
  return {
    layer: Layer.succeed(Agent, agent),
    calls: (): readonly AgentCall[] => calls,
    steps: (): readonly AgentStep[] => calls.map((call) => call.step),
    started: (step: AgentStep) => Deferred.await(begun[step]).pipe(Effect.asVoid),
  };
});

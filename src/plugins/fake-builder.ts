import { Deferred, Effect, Layer } from "effect";

import type { BuildTask, FixTask, TestReport } from "./builder.ts";
import { Builder, BuildFailed } from "./builder.ts";

export type BuildStep = "implement" | "test" | "fix";

/** One request the builder received, with the task it was given. */
export type BuildCall =
  | { readonly step: "implement"; readonly task: BuildTask }
  | { readonly step: "test"; readonly task: BuildTask }
  | { readonly step: "fix"; readonly task: FixTask };

export interface FakeBuilderScript {
  /** What each test run reports, in order. */
  readonly testReports: readonly TestReport[];
  /** A step that fails with `BuildFailed` every time it runs. */
  readonly failing?: BuildStep;
  /** A step that dies with a defect every time it runs. */
  readonly crashing?: BuildStep;
  /** A step that never finishes, so a test can stop the work item while it runs. */
  readonly hanging?: BuildStep;
}

const outcomeOf = <A>(script: FakeBuilderScript, step: BuildStep, result: Effect.Effect<A>) => {
  if (script.failing === step) {
    return Effect.fail(new BuildFailed({ message: `The builder gave up during ${step}` }));
  }
  if (script.crashing === step) {
    return Effect.die(new Error(`The builder exited during ${step}`));
  }
  return script.hanging === step ? Effect.never : result;
};

/**
 * A builder that follows a script instead of calling an AI. A test run beyond
 * the script dies, so a test that under-scripts its builder fails loudly.
 */
export const fakeBuilder = Effect.fnUntraced(function* (script: FakeBuilderScript) {
  const calls: BuildCall[] = [];
  const reports = [...script.testReports];
  const begun = {
    implement: yield* Deferred.make<BuildStep>(),
    test: yield* Deferred.make<BuildStep>(),
    fix: yield* Deferred.make<BuildStep>(),
  };
  const run = <A>(call: BuildCall, result: Effect.Effect<A>) =>
    Effect.suspend(() => {
      calls.push(call);
      return Deferred.succeed(begun[call.step], call.step).pipe(
        Effect.andThen(outcomeOf(script, call.step, result)),
      );
    });
  const nextReport = Effect.suspend(() => {
    const report = reports.shift();
    return report === undefined
      ? Effect.die(new Error("The fake builder ran out of scripted test reports"))
      : Effect.succeed(report);
  });
  const builder = Builder.of({
    implement: (task) => run({ step: "implement", task }, Effect.void),
    test: (task) => run({ step: "test", task }, nextReport),
    fix: (task) => run({ step: "fix", task }, Effect.void),
  });
  return {
    layer: Layer.succeed(Builder, builder),
    calls: (): readonly BuildCall[] => calls,
    steps: (): readonly BuildStep[] => calls.map((call) => call.step),
    started: (step: BuildStep) => Deferred.await(begun[step]).pipe(Effect.asVoid),
  };
});

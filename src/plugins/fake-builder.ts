import { Deferred, Effect, Layer } from "effect";

import type { BuildTask, FixTask, TestReport } from "./builder.ts";
import { Builder, BuilderGaveUp } from "./builder.ts";
import type { Misbehaviour } from "./fake-script.ts";
import { behaving, scriptedAnswers } from "./fake-script.ts";

export type BuildStep = "implement" | "test" | "fix";

/** One request the builder received, with the task it was given. */
export type BuildCall =
  | { readonly step: "implement"; readonly task: BuildTask }
  | { readonly step: "test"; readonly task: BuildTask }
  | { readonly step: "fix"; readonly task: FixTask };

export interface FakeBuilderScript {
  /** What each test run reports, in order. */
  readonly testReports: readonly TestReport[];
  /** A step that goes wrong every time it runs, and how. */
  readonly misbehaving?: { readonly step: BuildStep; readonly as: Misbehaviour };
}

const wrongdoingDuring = (step: BuildStep) => ({
  gaveUp: new BuilderGaveUp({ message: `The builder gave up during ${step}` }),
  defect: `The builder exited during ${step}`,
});

/** A builder that follows a script instead of calling an AI. */
export const fakeBuilder = Effect.fnUntraced(function* (script: FakeBuilderScript) {
  const calls: BuildCall[] = [];
  const reports = scriptedAnswers(script.testReports, "builder's test run");
  const begun = {
    implement: yield* Deferred.make<BuildStep>(),
    test: yield* Deferred.make<BuildStep>(),
    fix: yield* Deferred.make<BuildStep>(),
  };
  const modeOf = (step: BuildStep) =>
    script.misbehaving?.step === step ? script.misbehaving.as : undefined;
  const run = <A>(call: BuildCall, result: Effect.Effect<A>) =>
    Effect.suspend(() => {
      calls.push(call);
      return Deferred.succeed(begun[call.step], call.step).pipe(
        Effect.andThen(behaving(modeOf(call.step), wrongdoingDuring(call.step), result)),
      );
    });
  const builder = Builder.of({
    implement: (task) => run({ step: "implement", task }, Effect.void),
    test: (task) => run({ step: "test", task }, reports),
    fix: (task) => run({ step: "fix", task }, Effect.void),
  });
  return {
    layer: Layer.succeed(Builder, builder),
    calls: (): readonly BuildCall[] => calls,
    steps: (): readonly BuildStep[] => calls.map((call) => call.step),
    started: (step: BuildStep) => Deferred.await(begun[step]).pipe(Effect.asVoid),
  };
});

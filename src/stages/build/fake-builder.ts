import { Effect, Layer } from "effect";

import type { Misbehaving } from "../fake-script.ts";
import { scriptedAnswers, scriptedPort } from "../fake-script.ts";
import type { BuildTask, FixTask, TestReport } from "./builder.ts";
import { Builder, BuilderGaveUp } from "./builder.ts";

export type BuildStep = "implement" | "test" | "fix";

/** One request the builder received, with the task it was given. */
export type BuildCall =
  | { readonly step: "implement"; readonly task: BuildTask }
  | { readonly step: "test"; readonly task: BuildTask }
  | { readonly step: "fix"; readonly task: FixTask };

export interface FakeBuilderScript {
  /** What each test run reports, in order. */
  readonly testReports: readonly TestReport[];
  readonly misbehaving?: Misbehaving<BuildStep> | undefined;
}

/** A builder that follows a script instead of calling an AI. */
export const fakeBuilder = Effect.fnUntraced(function* (script: FakeBuilderScript) {
  const port = yield* scriptedPort<BuildStep, BuildCall, BuilderGaveUp>({
    port: "builder",
    steps: ["implement", "test", "fix"],
    misbehaving: script.misbehaving,
    gaveUp: (message) => new BuilderGaveUp({ message }),
  });
  const reports = scriptedAnswers(script.testReports, "builder's test run");
  const builder = Builder.of({
    implement: (task) => port.run({ step: "implement", task }, Effect.void),
    test: (task) => port.run({ step: "test", task }, reports),
    fix: (task) => port.run({ step: "fix", task }, Effect.void),
  });
  return {
    layer: Layer.succeed(Builder, builder),
    calls: port.calls,
    steps: (): readonly BuildStep[] => port.calls().map((call) => call.step),
    started: port.started,
  };
});

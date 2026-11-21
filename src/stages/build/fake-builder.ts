import type { FakePort, Misbehaving } from "../fake-script.ts";
import { everyStep, fakePort } from "../fake-script.ts";
import type { ReproductionCheck, TestReport } from "./builder.ts";
import { Builder, BuilderGaveUp } from "./builder.ts";

export type BuildStep = keyof Builder["Service"];

/** The builder as its fake and the stage contract suite know it. */
export const builderPort: FakePort<BuildStep, BuilderGaveUp> = {
  port: "builder",
  steps: everyStep<BuildStep>()(["implement", "test", "fix", "checkReproduction"]),
  gaveUp: (message) => new BuilderGaveUp({ message }),
};

export interface FakeBuilderScript {
  /** What each test run reports, in order. */
  readonly testReports: readonly TestReport[];
  /** What each check of a bug's reproduction reports, in order. */
  readonly reproductionChecks?: readonly ReproductionCheck[];
  readonly misbehaving?: Misbehaving<BuildStep> | undefined;
}

/** A builder that follows a script instead of calling an AI. */
export const fakeBuilder = (script: FakeBuilderScript) =>
  fakePort(Builder, builderPort, script.misbehaving, ({ answer, perform }) =>
    Builder.of({
      implement: (task) => perform("implement", task),
      test: (task) => answer("test", task, script.testReports),
      fix: (task) => perform("fix", task),
      checkReproduction: (task) =>
        answer("checkReproduction", task, script.reproductionChecks ?? []),
    }),
  );

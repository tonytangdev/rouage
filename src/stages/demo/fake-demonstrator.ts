import type { FakePort, Misbehaving } from "../fake-script.ts";
import { fakePort } from "../fake-script.ts";
import type { Demonstrated } from "./demonstrator.ts";
import { Demonstrator, DemonstratorGaveUp } from "./demonstrator.ts";

export type DemoStep = "demonstrate";

/** The demonstrator as its fake and the stage contract suite know it. */
export const demonstratorPort: FakePort<DemoStep, DemonstratorGaveUp> = {
  port: "demonstrator",
  steps: ["demonstrate"],
  gaveUp: (message) => new DemonstratorGaveUp({ message }),
};

export interface FakeDemonstratorScript {
  /** What each demonstrate returns, in order. */
  readonly demos: readonly Demonstrated[];
  readonly misbehaving?: Misbehaving<DemoStep> | undefined;
}

/** A demonstrator that follows a script instead of calling an AI. */
export const fakeDemonstrator = (script: FakeDemonstratorScript) =>
  fakePort(Demonstrator, demonstratorPort, script.misbehaving, ({ answer }) =>
    Demonstrator.of({ demonstrate: (task) => answer("demonstrate", task, script.demos) }),
  );

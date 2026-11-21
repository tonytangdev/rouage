import type { FakePort, Misbehaving } from "../fake-script.ts";
import { fakePort } from "../fake-script.ts";
import type { Planned } from "./planner.ts";
import { Planner, PlannerGaveUp } from "./planner.ts";

export type PlanStep = "plan";

/** The planner as its fake and the stage contract suite know it. */
export const plannerPort: FakePort<PlanStep, PlannerGaveUp> = {
  port: "planner",
  steps: ["plan"],
  gaveUp: (message) => new PlannerGaveUp({ message }),
};

export interface FakePlannerScript {
  /** What each plan returns, in order. */
  readonly plans: readonly Planned[];
  readonly misbehaving?: Misbehaving<PlanStep> | undefined;
}

/** A planner that follows a script instead of calling an AI. */
export const fakePlanner = (script: FakePlannerScript) =>
  fakePort(Planner, plannerPort, script.misbehaving, ({ answer }) =>
    Planner.of({ plan: (task) => answer("plan", task, script.plans) }),
  );

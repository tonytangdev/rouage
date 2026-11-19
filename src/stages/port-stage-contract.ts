import type { Scope } from "effect";
import { Effect } from "effect";

import type { Settled, StageAdapter } from "../lifecycle/stage-contract.ts";
import type { FakePort, Misbehaving } from "./fake-script.ts";
import { crashMessage, gaveUpMessage } from "./fake-script.ts";
import type { PortGaveUp } from "./port-stage.ts";

export interface PortStage<Step extends string> {
  readonly name: string;
  readonly port: FakePort<Step, PortGaveUp>;
  readonly outcome: unknown;
  readonly run: (
    misbehaving?: Misbehaving<Step>,
  ) => Effect.Effect<{ readonly settled: Settled<unknown> }, unknown, Scope.Scope>;
}

// A stage that runs its steps through a port fails and crashes the way its
// port does, so those cases come from making its first step misbehave.
/** The contract adapter for a stage that runs its steps through a fake port. */
export const portAdapter = <Step extends string>(stage: PortStage<Step>): StageAdapter => {
  const [firstStep] = stage.port.steps;
  const gaveUp = stage.port.gaveUp(gaveUpMessage(stage.port.port, firstStep));
  const settled = (misbehaving?: Misbehaving<Step>) =>
    Effect.map(stage.run(misbehaving), (run) => run.settled);
  return {
    name: stage.name,
    finished: settled(),
    outcome: stage.outcome,
    failed: settled({ step: firstStep, as: "failing" }),
    failure: { tag: gaveUp._tag, message: gaveUp.message },
    crashed: settled({ step: firstStep, as: "crashing" }),
    crashMessage: crashMessage(stage.port.port, firstStep),
  };
};

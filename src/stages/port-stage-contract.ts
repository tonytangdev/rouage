import type { Scope } from "effect";
import { Effect } from "effect";

import type { Settled, StageAdapter } from "../lifecycle/stage-contract.ts";
import type { Misbehaving } from "./fake-script.ts";
import { crashMessage, gaveUpMessage } from "./fake-script.ts";

export interface PortStage<Step extends string> {
  readonly name: string;
  readonly port: string;
  readonly gaveUpTag: string;
  readonly firstStep: Step;
  readonly outcome: unknown;
  readonly run: (
    misbehaving?: Misbehaving<Step>,
  ) => Effect.Effect<{ readonly settled: Settled<unknown> }, unknown, Scope.Scope>;
}

// A stage that runs its steps through a port fails and crashes the way its
// port does, so those cases come from making its first step misbehave.
/** The contract adapter for a stage that runs its steps through a fake port. */
export const portAdapter = <Step extends string>(stage: PortStage<Step>): StageAdapter => {
  const settled = (misbehaving?: Misbehaving<Step>) =>
    Effect.map(stage.run(misbehaving), (run) => run.settled);
  return {
    name: stage.name,
    finished: settled(),
    outcome: stage.outcome,
    failed: settled({ step: stage.firstStep, as: "failing" }),
    failure: { tag: stage.gaveUpTag, message: gaveUpMessage(stage.port, stage.firstStep) },
    crashed: settled({ step: stage.firstStep, as: "crashing" }),
    crashMessage: crashMessage(stage.port, stage.firstStep),
  };
};

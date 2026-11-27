import type { Layer } from "effect";
import { Effect, Schema } from "effect";

import type { GatekeeperTask } from "../../lifecycle/gatekeeper.ts";
import { Gatekeeper, GatekeeperDecisionSchema } from "../../lifecycle/gatekeeper.ts";
import type { PluginPromise } from "../plugin-contract.ts";
import { describePluginContract, promiseKept } from "../plugin-contract.ts";

const isDecision = Schema.is(GatekeeperDecisionSchema);

/** The promises of the Gatekeeper port (ADR 0021), each a check deciding `task`, a gate the gatekeeper can judge. */
export const gatekeeperContract = (task: GatekeeperTask) =>
  ({
    answersWithADecision: {
      name: "answers with a decision its schema accepts, so a rejection carries a comment and a hand-off a reason",
      check: Effect.gen(function* () {
        const gatekeeper = yield* Gatekeeper;
        const decision = yield* gatekeeper.decide(task);
        yield* promiseKept(
          isDecision(decision),
          `The gatekeeper answered ${JSON.stringify(decision)}, which is no decision`,
        );
      }),
    },
  }) satisfies Record<string, PluginPromise<Gatekeeper>>;

/** Declares the gatekeeper contract's tests for the Gatekeeper `layer` fills, deciding `task`. */
export const describeGatekeeperContract = <E>(
  title: string,
  layer: Layer.Layer<Gatekeeper, E>,
  task: GatekeeperTask,
) => {
  describePluginContract(`gatekeeper contract, ${title}`, gatekeeperContract(task), layer);
};

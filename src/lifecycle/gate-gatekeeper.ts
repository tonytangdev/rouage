import { gateAsk } from "./gatekeeper-step.ts";
import type { PluginGate } from "./gatekeeper.ts";
import { lifecycleSetup } from "./lifecycle-setup.ts";
import { pluginDecision } from "./plugin-decision.ts";

/**
 * The gatekeeper `gate` runs while it waits. A plugin's decision is raised
 * as the event a human's is, so the gate's own transitions take and record
 * it. A hand-off, or a gatekeeper that gives up, leaves the gate waiting for
 * a human, and never blocks the work item (ADR 0021).
 */
export const gateGatekeeper = (gate: PluginGate) =>
  lifecycleSetup.createStateConfig({
    invoke: {
      id: "gatekeeper",
      src: "gatekeeper",
      input: gateAsk(gate),
      onDone: ({ context, event: { output } }, enq) => {
        const decision = pluginDecision(context, gate, output);
        if (decision !== null) {
          enq.raise(decision);
        }
      },
      onError: () => ({}),
    },
  }).invoke;

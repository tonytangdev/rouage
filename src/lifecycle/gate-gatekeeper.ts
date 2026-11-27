import { gateAsk } from "./gatekeeper-step.ts";
import type { PluginGate } from "./gatekeeper.ts";
import { pluginKeeping } from "./gatekeepers.ts";
import { gaveUpReason, handOffReason } from "./hand-off.ts";
import { lifecycleSetup } from "./lifecycle-setup.ts";
import { pluginDecision } from "./plugin-decision.ts";
import { gateHandedOff } from "./transition.ts";
import { workItemAfter } from "./work-item-after.ts";

/**
 * The gatekeeper `gate` runs while it waits. A plugin's decision is raised
 * as the event a human's is, so the gate's own transitions take and record
 * it. A hand-off, or a gatekeeper that gives up, leaves the gate waiting for
 * a human with the reason they read, and never blocks the work item. A
 * human deciding first leaves the gate, which stops the judgement (ADR 0021).
 */
export const gateGatekeeper = (gate: PluginGate) =>
  lifecycleSetup.createStateConfig({
    invoke: {
      id: "gatekeeper",
      src: "gatekeeper",
      input: gateAsk(gate),
      onDone: ({ context, event: { output } }, enq) => {
        const by = pluginKeeping(context.gatekeepers, gate);
        if (by === null) {
          return {};
        }
        if (output.decision._tag === "handedOff") {
          const reason = handOffReason(by, output.decision);
          return { context: workItemAfter(context, gateHandedOff(gate, reason)) };
        }
        enq.raise(pluginDecision(by, output.decision, output.at));
        return {};
      },
      onError: ({ context, event: { error } }) => ({
        context: workItemAfter(context, gateHandedOff(gate, gaveUpReason(error))),
      }),
    },
  }).invoke;

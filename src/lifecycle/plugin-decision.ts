import type { GatekeeperJudgement } from "./gatekeeper-step.ts";
import type { PluginGate } from "./gatekeeper.ts";
import { pluginKeeping } from "./gatekeepers.ts";
import type { HumanDecision, WorkItemContext } from "./work-item.ts";

/** A plugin gatekeeper's decision at a gate, as the event a human deciding there sends, `by` the gatekeeper. */
export interface PluginDecision extends HumanDecision {
  readonly type: "approve" | "reject";
}

/**
 * The decision a plugin gatekeeper's judgement makes at `gate`, or `null`
 * when it makes none there: the gatekeeper handed the decision off, or the
 * gate is kept by a human, so the gate waits for one (ADR 0021).
 */
export const pluginDecision = (
  context: WorkItemContext,
  gate: PluginGate,
  { decision, at }: GatekeeperJudgement,
): PluginDecision | null => {
  const by = pluginKeeping(context.gatekeepers, gate);
  if (by === null || decision._tag === "handedOff") {
    return null;
  }
  return decision._tag === "approved"
    ? { type: "approve", by, at }
    : { type: "reject", by, at, comment: decision.comment };
};

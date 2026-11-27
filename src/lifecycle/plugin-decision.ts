import type { GatekeeperDecided } from "./gatekeeper.ts";
import type { HumanDecision } from "./work-item.ts";

/** A plugin gatekeeper's decision at a gate, as the event a human deciding there sends, `by` the gatekeeper. */
export interface PluginDecision extends HumanDecision {
  readonly type: "approve" | "reject";
}

/** The event for `decision`, recorded as made `by` the gatekeeper at the ISO timestamp `at`. */
export const pluginDecision = (
  decision: GatekeeperDecided,
  by: string,
  at: string,
): PluginDecision =>
  decision._tag === "approved"
    ? { type: "approve", by, at }
    : { type: "reject", by, at, comment: decision.comment };

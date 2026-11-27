import type { GatekeeperDecision } from "./gatekeeper.ts";
import type { PluginGatekeeper } from "./gatekeepers.ts";
import type { HumanDecision } from "./work-item.ts";

/** A plugin gatekeeper's decision at a gate, as the event a human deciding there sends, `by` the gatekeeper. */
export interface PluginDecision extends HumanDecision {
  readonly type: "approve" | "reject";
}

/** The event the plugin gatekeeper `by` sends for `decision`, made at the ISO timestamp `at`. */
export const pluginDecision = (
  by: PluginGatekeeper,
  decision: Exclude<GatekeeperDecision, { readonly _tag: "handedOff" }>,
  at: string,
): PluginDecision =>
  decision._tag === "approved"
    ? { type: "approve", by, at }
    : { type: "reject", by, at, comment: decision.comment };

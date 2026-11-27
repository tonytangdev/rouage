import { Predicate, Schema } from "effect";

import type { GatekeeperDecision } from "./gatekeeper.ts";
import { GatekeeperGaveUp, PluginGateSchema } from "./gatekeeper.ts";
import type { PluginGatekeeper } from "./gatekeepers.ts";

/**
 * Why the plugin keeping `gate` left the decision to a human, for the human
 * deciding there to read. Cleared once a decision leaves the gate (ADR 0021).
 */
export const HandOffSchema = Schema.Struct({ gate: PluginGateSchema, reason: Schema.String });
export type HandOff = typeof HandOffSchema.Type;

type HandedOff = Extract<GatekeeperDecision, { readonly _tag: "handedOff" }>;

/**
 * The reason a human reads for a hand-off by `by`. A plugin alone may not hand off,
 * so its reason says so, and the gate still waits for a human rather than
 * asking again, because the same task would be handed off again.
 */
export const handOffReason = (by: PluginGatekeeper, { reason }: HandedOff): string =>
  by === "plugin" ? `The gatekeeper may not hand off, yet handed off: ${reason}` : reason;

/** The reason a human reads when the gatekeeper's port gives up, or fails in any other way. */
export const gaveUpReason = (error: unknown): string => {
  if (error instanceof GatekeeperGaveUp) {
    return error.message;
  }
  return Predicate.isError(error) ? error.message : String(error);
};

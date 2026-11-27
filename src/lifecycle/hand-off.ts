import { Predicate, Schema } from "effect";

import type { HandedOff } from "./gatekeeper.ts";
import { PluginGateSchema } from "./gatekeeper.ts";
import type { GatekeeperKind } from "./gatekeepers.ts";

/**
 * Why the plugin keeping `gate` left the decision to a human, for the human
 * deciding there to read. Cleared once a decision leaves the gate (ADR 0021).
 */
export const HandOffSchema = Schema.Struct({ gate: PluginGateSchema, reason: Schema.String });
export type HandOff = typeof HandOffSchema.Type;

/**
 * The reason a human reads for a hand-off by a gatekeeper of `kind`. A plugin
 * alone may not hand off, so its reason says so, and the gate still waits for
 * a human rather than asking again, because the same task would be handed off
 * again.
 */
export const handOffReason = (kind: GatekeeperKind, { reason }: HandedOff): string =>
  kind === "plugin" ? `The gatekeeper may not hand off, yet handed off: ${reason}` : reason;

/** The reason a human reads when the gatekeeper's port gives up, or fails in any other way. */
export const gaveUpReason = (error: unknown): string =>
  Predicate.isError(error) ? error.message : String(error);

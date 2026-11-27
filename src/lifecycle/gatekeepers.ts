import { Schema } from "effect";

import type { PluginGate } from "./gatekeeper.ts";
import type { Gate } from "./place.ts";

/**
 * Who decides at a gate: a human; a plugin, through the Gatekeeper port,
 * that may hand the decision to a human; or a plugin alone (ADR 0021).
 */
export const GatekeeperKindSchema = Schema.Literals(["human", "pluginMayHandOff", "plugin"]);
export type GatekeeperKind = typeof GatekeeperKindSchema.Type;

/** A gatekeeper that is a plugin, which the lifecycle asks through the Gatekeeper port. */
export type PluginGatekeeper = Exclude<GatekeeperKind, "human">;

/**
 * The gatekeeper of each gate, saved with the work item when it is created
 * and never changed, so a restored work item is decided as it was before.
 * The sample gate's is always a human, because it waits for the user to run
 * the extraction script, not for a judgement (ADR 0021).
 */
export const GatekeepersSchema = Schema.Struct({
  specGate: GatekeeperKindSchema,
  sampleGate: Schema.Literal("human"),
  shipGate: GatekeeperKindSchema,
});
export type Gatekeepers = typeof GatekeepersSchema.Type;

/** The gatekeepers a work item gets unless it is created with others: a human at every gate. */
export const defaultGatekeepers = {
  specGate: "human",
  sampleGate: "human",
  shipGate: "human",
} as const satisfies Gatekeepers & Readonly<Record<Gate, GatekeeperKind>>;

/** The plugin keeping `gate`, or `null` when a human keeps it. */
export const pluginKeeping = (
  gatekeepers: Gatekeepers,
  gate: PluginGate,
): PluginGatekeeper | null => {
  const kind = gatekeepers[gate];
  return kind === "human" ? null : kind;
};

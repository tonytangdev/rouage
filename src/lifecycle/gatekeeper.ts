import type { Effect } from "effect";
import { Context, Data, Schema } from "effect";

import type { Gate } from "./place.ts";
import { StageInputSchema } from "./stage.ts";

const pluginGates = ["specGate", "shipGate"] as const satisfies readonly Gate[];

/**
 * The gates a plugin may decide. The sample gate is not one, because it waits
 * for the user to run the extraction script, not for a judgement (ADR 0021).
 */
export const PluginGateSchema = Schema.Literals(pluginGates);
export type PluginGate = typeof PluginGateSchema.Type;

/** The gate to decide and the facts the stages work from, as references rather than contents (ADR 0004). */
export const GatekeeperTaskSchema = Schema.Struct({
  gate: PluginGateSchema,
  ...StageInputSchema.fields,
});
export type GatekeeperTask = typeof GatekeeperTaskSchema.Type;

/**
 * The gatekeeper's decision: approve, reject with the comment the next stage
 * addresses, or hand the decision to a human with the reason they read.
 * Owned by the port rather than taken from the lifecycle's decisions, so the
 * plugin contract changes only when this port does (ADR 0003).
 */
export const GatekeeperDecisionSchema = Schema.Union([
  Schema.TaggedStruct("approved", {}),
  Schema.TaggedStruct("rejected", { comment: Schema.NonEmptyString }),
  Schema.TaggedStruct("handedOff", { reason: Schema.NonEmptyString }),
]);
export type GatekeeperDecision = typeof GatekeeperDecisionSchema.Type;

/** The gatekeeper could not decide at all, as opposed to handing the decision off. */
export class GatekeeperGaveUp extends Data.TaggedError("GatekeeperGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the lifecycle asks a plugin gatekeeper to decide at a gate through
 * (ADR 0021). Filled by an Agent plugin's Gatekeeper role following the
 * user's own rules, or by a Script plugin. A decision handed off, or a
 * gatekeeper that gives up, leaves the decision to a human at the same gate.
 * The lifecycle may stop a decision in flight, when a human decides first.
 */
export class Gatekeeper extends Context.Service<
  Gatekeeper,
  {
    readonly decide: (task: GatekeeperTask) => Effect.Effect<GatekeeperDecision, GatekeeperGaveUp>;
  }
>()("rouage/lifecycle/Gatekeeper") {}

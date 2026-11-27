import { Data, Effect, Schema } from "effect";

import type { Gate } from "./place.ts";

/**
 * Who decides at a gate: a human; a plugin, through the Gatekeeper port,
 * that may hand the decision to a human; or a plugin alone (ADR 0021).
 */
export const GatekeeperKindSchema = Schema.Literals(["human", "pluginMayHandOff", "plugin"]);
export type GatekeeperKind = typeof GatekeeperKindSchema.Type;

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

/**
 * A gatekeeper chosen for some gates, by the lifecycle's set-up or by a work
 * item when it is created. Checked against `GatekeepersSchema` only once
 * merged, so a choice it refuses, such as a plugin at the sample gate, is
 * refused when the work item is created.
 */
export type GatekeeperChoices = Partial<Readonly<Record<Gate, GatekeeperKind>>>;

/** The gatekeepers a work item gets when neither its lifecycle nor itself chooses others: a human at every gate. */
export const defaultGatekeepers = {
  specGate: "human",
  sampleGate: "human",
  shipGate: "human",
} as const satisfies Gatekeepers;

/** The gatekeepers chosen for a work item are ones `GatekeepersSchema` refuses. */
export class GatekeepersRefused extends Data.TaggedError("GatekeepersRefused")<{
  readonly message: string;
}> {}

/**
 * The gatekeepers of a work item: `defaultGatekeepers`, then each of
 * `choices` in turn on top. Fails with `GatekeepersRefused` when the result
 * does not fit `GatekeepersSchema`.
 */
export const chosenGatekeepers = (...choices: readonly GatekeeperChoices[]) =>
  Schema.decodeUnknownEffect(GatekeepersSchema)(
    Object.assign({}, defaultGatekeepers, ...choices),
  ).pipe(Effect.mapError((error) => new GatekeepersRefused({ message: error.message })));

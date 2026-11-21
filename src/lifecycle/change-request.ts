import { Schema } from "effect";

/**
 * What the change was last sent back to Build to address, and where that came
 * from: the changes Review requested, or a human's rejection at the ship gate,
 * whose `text` is `null` when it came without a comment (ADR 0012).
 */
export const ChangeRequestSchema = Schema.Union([
  Schema.Struct({ from: Schema.Literal("review"), text: Schema.String }),
  Schema.Struct({ from: Schema.Literal("shipGate"), text: Schema.NullOr(Schema.String) }),
]);
export type ChangeRequest = typeof ChangeRequestSchema.Type;

/** The change request Review's requested changes make. */
export const requestedByReview = (feedback: string) => ({
  changeRequest: { from: "review", text: feedback } satisfies ChangeRequest,
});

/** The change request a human's rejection at the ship gate makes, with or without a comment. */
export const requestedAtShipGate = (comment: string | null) => ({
  changeRequest: { from: "shipGate", text: comment } satisfies ChangeRequest,
});

/** The change request on return to Spec: none, because a new spec makes earlier requests obsolete. */
export const changeRequestOnReturnToSpec = { changeRequest: null };

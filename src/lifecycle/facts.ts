import { Record, Schema } from "effect";

import { changeRequestFact } from "./change-request.ts";
import { demoFact } from "./demo-decision.ts";
import { feedbackFact } from "./feedback.ts";
import type { Teaching } from "./outcome-teaching.ts";
import { KindSchema } from "./stage.ts";
import type { Transition } from "./transition.ts";

/**
 * A fact with a lifetime of its own, rather than a reference only a newer
 * outcome replaces: its fields, their value before any stage has worked, and
 * their value after each transition, given what it taught. Adding one means
 * declaring it and listing it in the work item's facts below.
 */
export interface StandingFact<S extends Schema.Struct<Schema.Struct.Fields>> {
  readonly schema: S;
  readonly empty: S["Type"];
  readonly after: (value: S["Type"], transition: Transition, taught: Teaching) => S["Type"];
}

const Reference = Schema.NullOr(Schema.String);

/** The facts only the outcome that teaches them changes, each replaced only by a newer one (ADR 0004). */
const ReferencesSchema = Schema.Struct({
  kind: Schema.NullOr(KindSchema),
  /** The reference to the latest written spec, opaque to Rouage; only the next written spec replaces it (ADR 0004). */
  specRef: Reference,
  /** The reference to the work item's sandbox, opaque to Rouage; set by Provision (ADR 0004). */
  sandboxRef: Reference,
  /** Reproduce's description of the data a bug needs, which Provision takes a sample of; never cleared (ADR 0005). */
  sampleRequest: Reference,
  /** The reference to the sample Provision took into the sandbox, opaque to Rouage (ADR 0004). */
  sampleRef: Reference,
  /** The reference to the latest extraction script the user was asked to run, opaque to Rouage; only the next script replaces it (ADR 0004, ADR 0008). */
  scriptRef: Reference,
  /** The reference to the bug's latest captured reproduction, opaque to Rouage; confirmed failing only once Reproduce finishes with a reproduction, and only the next reproduction replaces it (ADR 0004, ADR 0006, ADR 0009). */
  reproductionRef: Reference,
  /** The reference to the latest plan, opaque to Rouage; only the next plan replaces it (ADR 0004). */
  planRef: Reference,
  /** The reference to where Ship delivered the change, opaque to Rouage (ADR 0004); `null` until shipped. */
  deliveryRef: Reference,
});
export type References = typeof ReferencesSchema.Type;

/** What the work item holds that every stage sees, except the demo facts, which stages see only as the one demo their input shows. */
export const StageFactsSchema = Schema.Struct({
  issueRef: Schema.String,
  ...ReferencesSchema.fields,
  ...feedbackFact.schema.fields,
  ...changeRequestFact.schema.fields,
  ...demoFact.schema.fields,
});
export type StageFacts = typeof StageFactsSchema.Type;

/** The facts of a work item no stage has worked on yet; only `issueRef` is known from the start. */
export const noFactsYet: Omit<StageFacts, "issueRef"> = {
  ...Record.map(ReferencesSchema.fields, () => null),
  ...feedbackFact.empty,
  ...changeRequestFact.empty,
  ...demoFact.empty,
};

/**
 * The work item's facts after `transition`, given what it `taught`: what the
 * outcome teaches when a stage finished, less what a loop at its limit does
 * not send back, else nothing. References are replaced only by the outcome
 * that teaches a newer one; each standing fact follows its own lifetime.
 */
export const factsAfter = (
  facts: StageFacts,
  transition: Transition,
  taught: Teaching,
): StageFacts => ({
  ...facts,
  ...taught.references,
  ...feedbackFact.after(facts, transition, taught),
  ...changeRequestFact.after(facts, transition, taught),
  ...demoFact.after(facts, transition, taught),
});

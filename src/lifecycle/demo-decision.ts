import { Schema } from "effect";

/** What the work item holds to decide whether a demo is made and which demo a stage sees (ADR 0011). */
export const DemoFactsSchema = Schema.Struct({
  /** Whether the latest plan calls for a demo, or `null` before Plan has run. */
  demoPlanned: Schema.NullOr(Schema.Boolean),
  /** Whether a human required a demo, over any plan, or `null` when no human has decided since the last return to Spec. */
  demoOverride: Schema.NullOr(Schema.Boolean),
  /** The reference to the latest demo, opaque to Rouage; only the next demo replaces it (ADR 0004). */
  demoRef: Schema.NullOr(Schema.String),
  /** Whether Build has finished since the latest demo was made, so the demo no longer shows the change. */
  demoOutdated: Schema.Boolean,
});
export type DemoFacts = typeof DemoFactsSchema.Type;

type DemoChange = Partial<DemoFacts>;

/** The names of the demo facts, which no stage reads directly. */
export const demoFactNames = [
  "demoPlanned",
  "demoOverride",
  "demoRef",
  "demoOutdated",
] as const satisfies ReadonlyArray<keyof DemoFacts>;

/** The demo facts of a work item no stage has worked on yet. */
export const noDemoYet: DemoFacts = {
  demoPlanned: null,
  demoOverride: null,
  demoRef: null,
  demoOutdated: false,
};

/** Whether the work item calls for a demo: a human's override when there is one, else the latest plan's decision. */
export const demoCalledFor = (facts: DemoFacts): boolean =>
  (facts.demoOverride ?? facts.demoPlanned) === true;

/** The demo every stage but Demo sees: the latest one only while the work item calls for a demo and no build has finished since it was made. */
export const demoShown = (facts: DemoFacts): string | null =>
  demoCalledFor(facts) && !facts.demoOutdated ? facts.demoRef : null;

/** The demo Demo sees: the latest one even when outdated, so the plugin revises it rather than starting over (ADR 0004). */
export const demoToRevise = (facts: DemoFacts): string | null => facts.demoRef;

/** Whether a retry from a block at `blockedFrom` goes on to Review, because re-entering Demo would make a demo the work item no longer calls for. */
export const retrySkipsDemo = (blockedFrom: string, facts: DemoFacts): boolean =>
  blockedFrom === "demo" && !demoCalledFor(facts);

/** What a plan teaches: its demo decision. */
export const demoPlannedBy = (demo: boolean): DemoChange => ({ demoPlanned: demo });

/** What a finished build teaches: the latest demo no longer shows the change. */
export const demoOutdatedByBuild: DemoChange = { demoOutdated: true };

/** What a finished demo teaches: the new demo, which shows the latest build. */
export const demoMade = (demoRef: string): DemoChange => ({ demoRef, demoOutdated: false });

/** A human requiring a demo, which stands over any later plan. */
export const demoRequiredByHuman: DemoChange = { demoOverride: true };

/** A human skipping a demo, which stands over any later plan. */
export const demoSkippedByHuman: DemoChange = { demoOverride: false };

/** Returning to Spec drops a human's override, because the new spec's plan makes a demo decision the human has not yet seen. */
export const demoOnReturnToSpec: DemoChange = { demoOverride: null };

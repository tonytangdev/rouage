import { Match, Schema, Struct } from "effect";

import type { AnyOutcome, FactEvent } from "./fact-event.ts";
import type { StandingFact } from "./facts.ts";

/** What the work item holds to decide whether a demo is made and which demo a stage sees (ADR 0011). */
const DemoFactsSchema = Schema.Struct({
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

/** The names of the demo facts, which no stage reads directly. */
export const demoFactNames = [
  "demoPlanned",
  "demoOverride",
  "demoRef",
  "demoOutdated",
] as const satisfies ReadonlyArray<keyof DemoFacts>;

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

const demoTaughtBy = (facts: DemoFacts, outcome: AnyOutcome): DemoFacts => {
  if (outcome._tag === "planned") {
    return { ...facts, demoPlanned: outcome.demo };
  }
  // A demo made before the latest build no longer shows the change.
  if (outcome._tag === "built") {
    return { ...facts, demoOutdated: true };
  }
  if (outcome._tag === "demonstrated") {
    return { ...facts, demoRef: outcome.demoRef, demoOutdated: false };
  }
  return facts;
};

// A human's override stands over any later plan and is dropped only on return
// to Spec, because the new spec's plan makes a demo decision the human has not
// yet seen (ADR 0011).
const demoFactsAfter = (facts: DemoFacts, event: FactEvent): DemoFacts =>
  Match.valueTags(event, {
    stageFinished: ({ outcome }) => demoTaughtBy(facts, outcome),
    loopExhausted: ({ outcome }) => demoTaughtBy(facts, outcome),
    gateRejected: () => facts,
    returnedToSpec: () => ({ ...facts, demoOverride: null }),
    retried: () => facts,
    demoOverridden: ({ demo }) => ({ ...facts, demoOverride: demo }),
  });

/** The demo decision and the latest demo, which stages see only as the one demo their input shows. */
export const demoFact: StandingFact<typeof DemoFactsSchema> = {
  schema: DemoFactsSchema,
  empty: { demoPlanned: null, demoOverride: null, demoRef: null, demoOutdated: false },
  after: (facts, event) => demoFactsAfter(Struct.pick(facts, demoFactNames), event),
};

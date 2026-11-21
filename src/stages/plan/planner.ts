import type { Effect } from "effect";
import { Context, Data, Schema } from "effect";

import { KindSchema } from "../../lifecycle/kind.ts";
import { RunBriefSchema } from "../run-brief.ts";

export const PlanTaskSchema = Schema.Struct({
  ...RunBriefSchema.fields,
  issueRef: Schema.String,
  kind: Schema.NullOr(KindSchema),
  specRef: Schema.NullOr(Schema.String),
  sandboxRef: Schema.NullOr(Schema.String),
  /** The sample Provision took into the sandbox, or null when none was taken. */
  sampleRef: Schema.NullOr(Schema.String),
  /** The bug's reproduction, or null for a feature. */
  reproductionRef: Schema.NullOr(Schema.String),
  /** The plan written before, for the planner to revise; null on the first plan. */
  previousPlanRef: Schema.NullOr(Schema.String),
});
export type PlanTask = typeof PlanTaskSchema.Type;

/** The planner's answer: a reference to the plan it stored, and whether the change is worth a demo. */
export interface Planned {
  readonly planRef: string;
  readonly demo: boolean;
}

/** The planner could not write a plan, such as when the spec cannot be built as written. */
export class PlannerGaveUp extends Data.TaggedError("PlannerGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Plan stage plans a change through: it stores the plan where it
 * chooses behind an opaque reference (ADR 0004) and decides whether a demo is
 * worth it. A restart runs `plan` again for the same task, so the planner must
 * replace whatever it stored for that task rather than add to it. Usually
 * filled by an Agent plugin.
 */
export class Planner extends Context.Service<
  Planner,
  { readonly plan: (task: PlanTask) => Effect.Effect<Planned, PlannerGaveUp> }
>()("rouage/stages/plan/Planner") {}

import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { Kind } from "../../lifecycle/stage.ts";

export interface PlanTask {
  readonly workItemId: string;
  readonly issueRef: string;
  readonly kind: Kind | null;
  readonly specRef: string | null;
  readonly sandboxRef: string | null;
  /** The sample Provision took into the sandbox, or `null` when none was taken. */
  readonly sampleRef: string | null;
  /** The bug's reproduction, or `null` for a feature. */
  readonly reproductionRef: string | null;
  /** The plan written before, for the planner to revise; `null` on the first plan. */
  readonly previousPlanRef: string | null;
  /** The feedback for this run, such as a retry's comment, or `null` when there is none. */
  readonly feedback: string | null;
}

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

import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { Kind, OutcomeOf } from "../../lifecycle/stage.ts";

export interface ReviewTask {
  readonly workItemId: string;
  readonly issueRef: string;
  readonly kind: Kind | null;
  readonly specRef: string | null;
  /** The plan Build followed, or `null` when the lifecycle runs no Plan. */
  readonly planRef: string | null;
  /** The sandbox holding the change and its tests. */
  readonly sandboxRef: string;
  /** The bug's reproduction, or `null` for a feature. */
  readonly reproductionRef: string | null;
  /** The demo of the change, or `null` when the latest plan calls for none. */
  readonly demoRef: string | null;
}

/** The reviewer's verdict: approve the change, or request changes with feedback for Build. */
export type Verdict = OutcomeOf<"review">;

/** The reviewer could not reach a verdict. */
export class ReviewerGaveUp extends Data.TaggedError("ReviewerGaveUp")<{
  readonly message: string;
}> {}

/**
 * The port the Review stage judges a built change through: it reviews the
 * change in the work item's sandbox against its spec, plan and evidence, and
 * gives a verdict. A restart runs `review` again for the same task, so the
 * reviewer must replace whatever it stored or posted for that task rather
 * than add to it. Usually filled by an Agent plugin.
 */
export class Reviewer extends Context.Service<
  Reviewer,
  { readonly review: (task: ReviewTask) => Effect.Effect<Verdict, ReviewerGaveUp> }
>()("rouage/stages/review/Reviewer") {}

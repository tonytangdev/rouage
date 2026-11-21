import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { ChangeRequest } from "../../lifecycle/change-request.ts";
import type { OutcomeOf } from "../../lifecycle/stage.ts";
import type { DemonstratedChange } from "../built-change.ts";

export interface ReviewTask extends DemonstratedChange {
  /** What the change was last sent back to Build to address, for the reviewer to check it was; `null` until the change is first sent back, and again after a return to Spec (ADR 0012). */
  readonly changeRequest: ChangeRequest | null;
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
 * gives a verdict. For a bug, Build has confirmed the reproduction passes
 * before Review starts (ADR 0010). A restart runs `review` again for the same
 * task, so the reviewer must replace whatever it stored or posted for that
 * task rather than add to it. Usually filled by an Agent plugin.
 */
export class Reviewer extends Context.Service<
  Reviewer,
  { readonly review: (task: ReviewTask) => Effect.Effect<Verdict, ReviewerGaveUp> }
>()("rouage/stages/review/Reviewer") {}

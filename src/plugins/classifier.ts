import type { Effect } from "effect";
import { Context, Data } from "effect";

export interface ClassifyTask {
  readonly workItemId: string;
  readonly issueRef: string;
  /** A human's comment from sending the work item back to Intake, passed on as written. */
  readonly feedback: string | null;
}

/** The classifier's verdict on an issue; `unclear` when it cannot tell a bug from a feature. */
export type Classification =
  | { readonly _tag: "bug" }
  | { readonly _tag: "feature" }
  | { readonly _tag: "unclear"; readonly reason: string };

/** The classifier could not carry out a task. */
export class ClassifyFailed extends Data.TaggedError("ClassifyFailed")<{
  readonly message: string;
}> {}

/**
 * The port the Intake stage classifies through: it reads the issue behind
 * `issueRef` itself and says whether it describes a bug or a feature. An Agent
 * or a Script plugin can fill it.
 */
export class Classifier extends Context.Service<
  Classifier,
  {
    readonly classify: (task: ClassifyTask) => Effect.Effect<Classification, ClassifyFailed>;
  }
>()("rouage/plugins/Classifier") {}

import type { Effect } from "effect";
import { Context, Data } from "effect";

import type { Kind } from "../../lifecycle/stage.ts";
import type { RunBrief } from "../run-brief.ts";

export interface ClassifyTask extends RunBrief {
  readonly issueRef: string;
}

/** The classifier's verdict on an issue; `unclear` when it cannot tell a bug from a feature. */
export type Classification =
  | { readonly _tag: "classified"; readonly kind: Kind }
  | { readonly _tag: "unclear"; readonly reason: string };

/** The classifier could not read or judge the issue at all, as opposed to judging it unclear. */
export class ClassifierGaveUp extends Data.TaggedError("ClassifierGaveUp")<{
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
    readonly classify: (task: ClassifyTask) => Effect.Effect<Classification, ClassifierGaveUp>;
  }
>()("rouage/stages/intake/Classifier") {}

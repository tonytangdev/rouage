import type { Effect } from "effect";
import { Context, Data, Schema } from "effect";

import { KindSchema } from "../../lifecycle/kind.ts";
import { RunBriefSchema } from "../run-brief.ts";

export const ClassifyTaskSchema = Schema.Struct({
  ...RunBriefSchema.fields,
  issueRef: Schema.String,
});
export type ClassifyTask = typeof ClassifyTaskSchema.Type;

/**
 * The classifier's verdict on an issue; `unclear` when it cannot tell a bug
 * from a feature, with the reason a human reads at Blocked.
 */
export const ClassificationSchema = Schema.Union([
  Schema.TaggedStruct("classified", { kind: KindSchema }),
  Schema.TaggedStruct("unclear", { reason: Schema.NonEmptyString }),
]);
export type Classification = typeof ClassificationSchema.Type;

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

import { Effect } from "effect";

import { ClassificationSchema, Classifier, ClassifierGaveUp } from "../../index.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { PluginParts } from "./port-run.ts";
import { runRole } from "./port-run.ts";
import type { Role } from "./roles.ts";

const classification = portAnswerOf(ClassificationSchema);

/** The Classifier port done in the `classify` role, in the repository checkout, since Intake runs before Provision. */
export const claudeClassifier = (parts: PluginParts, roles: { readonly classify: Role }) =>
  Classifier.of({
    classify: (task) =>
      runRole(parts, roles.classify, classification, task).pipe(
        Effect.mapError((failure) => new ClassifierGaveUp({ message: failure.message })),
      ),
  });

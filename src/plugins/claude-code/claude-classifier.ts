import { Effect } from "effect";

import { ClassificationSchema, Classifier, ClassifierGaveUp } from "../../index.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import { workingDirOf } from "./claude-code-options.ts";
import type { ClaudeRunner } from "./claude-runner.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { Role } from "./roles.ts";
import { fillTemplate } from "./roles.ts";

const classification = portAnswerOf(ClassificationSchema);

/** The Classifier port done in the `classify` role, in the repository checkout, since Intake runs before Provision. */
export const claudeClassifier = (runner: ClaudeRunner, role: Role, plugin: PluginSettings) =>
  Classifier.of({
    classify: (task) =>
      runner
        .run(
          {
            role,
            workItemId: task.workItemId,
            instructions: fillTemplate(role.template, task),
            jsonSchema: classification.jsonSchema,
            cwd: workingDirOf(plugin, null),
          },
          classification.answer,
        )
        .pipe(
          Effect.map(({ answer }) => answer),
          Effect.mapError((failure) => new ClassifierGaveUp({ message: failure.message })),
        ),
  });

import { Effect, Schema } from "effect";

import type { Written } from "../../index.ts";
import { SpecWriter, SpecWriterGaveUp } from "../../index.ts";
import type { ArtifactNotStored, ArtifactStore } from "./artifacts.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import { workingDirOf } from "./claude-code-options.ts";
import type { ClaudeRunner } from "./claude-runner.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { Role } from "./roles.ts";
import { fillTemplate } from "./roles.ts";

// Claude gives the spec's content rather than writing it, because the write
// role is read-only; the plugin stores it and answers with its reference.
const writing = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("written", { spec: Schema.NonEmptyString }),
    Schema.TaggedStruct("unclear", { reason: Schema.NonEmptyString }),
  ]),
);

const writtenOf = (
  store: ArtifactStore,
  workItemId: string,
  answer: typeof writing.answer.Type.answer,
): Effect.Effect<Written, ArtifactNotStored> =>
  answer._tag === "unclear"
    ? Effect.succeed(answer)
    : Effect.map(store(workItemId, "spec", answer.spec), (specRef) => ({
        _tag: "written",
        specRef,
      }));

/** The SpecWriter port done in the `write` role, in the repository checkout, since Spec runs before Provision. */
export const claudeSpecWriter = (
  runner: ClaudeRunner,
  role: Role,
  plugin: PluginSettings,
  store: ArtifactStore,
) =>
  SpecWriter.of({
    write: (task) =>
      runner
        .run(
          {
            role,
            workItemId: task.workItemId,
            instructions: fillTemplate(role.template, task),
            jsonSchema: writing.jsonSchema,
            cwd: workingDirOf(plugin, null),
          },
          writing.answer,
        )
        .pipe(
          Effect.flatMap(({ answer }) => writtenOf(store, task.workItemId, answer)),
          Effect.mapError((failure) => new SpecWriterGaveUp({ message: failure.message })),
        ),
  });

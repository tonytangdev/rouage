import { Effect, Schema } from "effect";

import type { Demonstrated } from "../../index.ts";
import { Demonstrator, DemonstratorGaveUp } from "../../index.ts";
import type { ArtifactNotStored, ArtifactStore } from "./artifacts.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import { workingDirOf } from "./claude-code-options.ts";
import type { ClaudeRunner } from "./claude-runner.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { Role } from "./roles.ts";
import { fillTemplate } from "./roles.ts";

// Claude gives the demo's content rather than leaving it in the sandbox,
// because the demo must outlive the sandbox; the plugin stores it outside.
const demonstrating = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("demonstrated", { demo: Schema.NonEmptyString }),
    Schema.TaggedStruct("stuck", { reason: Schema.NonEmptyString }),
  ]),
);

const gaveUp = (message: string) => new DemonstratorGaveUp({ message });

/**
 * The Demonstrator port done in the code-changing `demonstrate` role, in the
 * sandbox's workspace. The v1 demo is Claude's Markdown record of the commands
 * it ran there and what they printed, stored at the work item's demo path.
 */
export const claudeDemonstrator = (
  runner: ClaudeRunner,
  role: Role,
  plugin: PluginSettings,
  store: ArtifactStore,
) =>
  Demonstrator.of({
    demonstrate: (task) =>
      runner
        .run(
          {
            role,
            workItemId: task.workItemId,
            instructions: fillTemplate(role.template, task),
            jsonSchema: demonstrating.jsonSchema,
            cwd: workingDirOf(plugin, task.sandboxRef),
          },
          demonstrating.answer,
        )
        .pipe(
          Effect.flatMap(
            ({ answer }): Effect.Effect<Demonstrated, DemonstratorGaveUp | ArtifactNotStored> =>
              answer._tag === "stuck"
                ? Effect.fail(gaveUp(answer.reason))
                : Effect.map(store(task.workItemId, "demo", answer.demo), (demoRef) => ({
                    demoRef,
                  })),
          ),
          Effect.mapError((failure) => gaveUp(failure.message)),
        ),
  });

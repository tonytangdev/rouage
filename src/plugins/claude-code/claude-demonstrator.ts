import { Effect, Schema } from "effect";

import type { Demonstrated } from "../../index.ts";
import { Demonstrator, DemonstratorGaveUp } from "../../index.ts";
import type { ArtifactNotStored } from "./artifacts.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { PluginParts } from "./port-run.ts";
import { runRole } from "./port-run.ts";
import type { Role } from "./roles.ts";

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
export const claudeDemonstrator = (parts: PluginParts, roles: { readonly demonstrate: Role }) =>
  Demonstrator.of({
    demonstrate: (task) =>
      runRole(parts, roles.demonstrate, demonstrating, task).pipe(
        Effect.flatMap(
          (answer): Effect.Effect<Demonstrated, DemonstratorGaveUp | ArtifactNotStored> =>
            answer._tag === "stuck"
              ? Effect.fail(gaveUp(answer.reason))
              : Effect.map(parts.store(task.workItemId, "demo", answer.demo), (demoRef) => ({
                  demoRef,
                })),
        ),
        Effect.mapError((failure) => gaveUp(failure.message)),
      ),
  });

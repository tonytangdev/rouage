import { Effect, Schema } from "effect";

import { Planner, PlannerGaveUp } from "../../index.ts";
import type { ArtifactStore } from "./artifacts.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import { workingDirOf } from "./claude-code-options.ts";
import type { ClaudeRunner } from "./claude-runner.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { Role } from "./roles.ts";
import { fillTemplate } from "./roles.ts";

// Claude gives the plan's content rather than writing it, because the plan
// role is read-only; the plugin stores it and answers with its reference.
const planning = portAnswerOf(Schema.Struct({ plan: Schema.NonEmptyString, demo: Schema.Boolean }));

/** The Planner port done in the `plan` role, in the sandbox's workspace, or the repository checkout when there is none. */
export const claudePlanner = (
  runner: ClaudeRunner,
  role: Role,
  plugin: PluginSettings,
  store: ArtifactStore,
) =>
  Planner.of({
    plan: (task) =>
      runner
        .run(
          {
            role,
            workItemId: task.workItemId,
            instructions: fillTemplate(role.template, task),
            jsonSchema: planning.jsonSchema,
            cwd: workingDirOf(plugin, task.sandboxRef),
          },
          planning.answer,
        )
        .pipe(
          Effect.flatMap(({ answer }) =>
            Effect.map(store(task.workItemId, "plan", answer.plan), (planRef) => ({
              planRef,
              demo: answer.demo,
            })),
          ),
          Effect.mapError((failure) => new PlannerGaveUp({ message: failure.message })),
        ),
  });

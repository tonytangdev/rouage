import { Effect, Schema } from "effect";

import { Planner, PlannerGaveUp } from "../../index.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { PluginParts } from "./port-run.ts";
import { runRole } from "./port-run.ts";
import type { Role } from "./roles.ts";

// Claude gives the plan's content rather than writing it, because the plan
// role is read-only; the plugin stores it and answers with its reference.
const planning = portAnswerOf(Schema.Struct({ plan: Schema.NonEmptyString, demo: Schema.Boolean }));

/** The Planner port done in the `plan` role, in the sandbox's workspace, or the repository checkout when there is none. */
export const claudePlanner = (parts: PluginParts, roles: { readonly plan: Role }) =>
  Planner.of({
    plan: (task) =>
      runRole(parts, roles.plan, planning, task).pipe(
        Effect.flatMap((answer) =>
          Effect.map(parts.store(task.workItemId, "plan", answer.plan), (planRef) => ({
            planRef,
            demo: answer.demo,
          })),
        ),
        Effect.mapError((failure) => new PlannerGaveUp({ message: failure.message })),
      ),
  });

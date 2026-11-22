import { Effect, Match, Schema } from "effect";

import type { ReviewTask } from "../../index.ts";
import { Reviewer, ReviewerGaveUp } from "../../index.ts";
import type { ArtifactStore } from "./artifacts.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import { workingDirOf } from "./claude-code-options.ts";
import type { ClaudeRunner } from "./claude-runner.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { Role } from "./roles.ts";
import { fillTemplate } from "./roles.ts";

// Claude gives the review's content rather than writing it, because the
// review role is read-only; the plugin stores it for the ship gate.
const reviewing = portAnswerOf(
  Schema.Struct({
    verdict: Schema.Union([
      Schema.TaggedStruct("approved", {}),
      Schema.TaggedStruct("changesRequested", { feedback: Schema.NonEmptyString }),
    ]),
    review: Schema.NonEmptyString,
  }),
);

const sentBack = "The change was last sent back to Build because";

// A ship gate rejection without a comment still says a human rejected the
// change, unlike no request at all (ADR 0012).
const changeRequestIn = (request: ReviewTask["changeRequest"]) =>
  request === null
    ? "The change has not been sent back to Build."
    : Match.value(request).pipe(
        Match.when({ from: "review" }, ({ text }) => `${sentBack} Review requested: ${text}.`),
        Match.when({ from: "ship" }, ({ text }) => `${sentBack} it could not be shipped: ${text}.`),
        Match.orElse(({ text }) =>
          text === null
            ? `${sentBack} a human rejected it at the ship gate, without saying why.`
            : `${sentBack} a human rejected it at the ship gate: ${text}.`,
        ),
      );

/** The Reviewer port done in the `review` role, in the sandbox's workspace, checking the change request when there is one (ADR 0012). */
export const claudeReviewer = (
  runner: ClaudeRunner,
  role: Role,
  plugin: PluginSettings,
  store: ArtifactStore,
) =>
  Reviewer.of({
    review: (task) =>
      runner
        .run(
          {
            role,
            workItemId: task.workItemId,
            instructions: fillTemplate(role.template, {
              ...task,
              changeRequest: changeRequestIn(task.changeRequest),
            }),
            jsonSchema: reviewing.jsonSchema,
            cwd: workingDirOf(plugin, task.sandboxRef),
          },
          reviewing.answer,
        )
        .pipe(
          Effect.flatMap(({ answer }) =>
            Effect.as(store(task.workItemId, "review", answer.review), answer.verdict),
          ),
          Effect.mapError((failure) => new ReviewerGaveUp({ message: failure.message })),
        ),
  });

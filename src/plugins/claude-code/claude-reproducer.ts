import { Effect, Schema } from "effect";

import type { Captured, ConfirmTask } from "../../index.ts";
import { Reproducer, ReproducerGaveUp } from "../../index.ts";
import type { ArtifactNotStored, ArtifactStore } from "./artifacts.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import { workingDirOf } from "./claude-code-options.ts";
import type { ClaudeRunner } from "./claude-runner.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { Role } from "./roles.ts";
import { fillTemplate } from "./roles.ts";
import type { TestCommandRunner } from "./test-command.ts";

// Claude gives the reproduction's content as well as writing its check in
// the sandbox, because the artifact must outlive the sandbox; the plugin
// stores it outside and answers with its reference.
const capturing = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("captured", { reproduction: Schema.NonEmptyString }),
    Schema.TaggedStruct("needsSample", { sampleRequest: Schema.NonEmptyString }),
    Schema.TaggedStruct("cannotReproduce", { reason: Schema.NonEmptyString }),
  ]),
);

const confirming = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("failed", {}),
    Schema.TaggedStruct("passed", { output: Schema.String }),
  ]),
);

/** The roles and collaborators the Claude Code reproducer works with. */
export interface ReproducerParts {
  readonly runner: ClaudeRunner;
  readonly capture: Role;
  readonly confirm: Role;
  readonly plugin: PluginSettings;
  readonly store: ArtifactStore;
  readonly tests: TestCommandRunner | null;
}

const gaveUp = (failure: { readonly message: string }) =>
  new ReproducerGaveUp({ message: failure.message });

const confirmedByTests = (tests: TestCommandRunner, cwd: string | undefined) =>
  Effect.map(tests.run(cwd), (run) => (run._tag === "failed" ? { _tag: "failed" as const } : run));

const confirmedByClaude = (parts: ReproducerParts, task: ConfirmTask) =>
  Effect.map(
    parts.runner.run(
      {
        role: parts.confirm,
        workItemId: task.workItemId,
        instructions: fillTemplate(parts.confirm.template, task),
        jsonSchema: confirming.jsonSchema,
        cwd: workingDirOf(parts.plugin, task.sandboxRef),
      },
      confirming.answer,
    ),
    ({ answer }) => answer,
  );

/**
 * The Reproducer port done in the code-changing `capture` and `confirm`
 * roles, in the sandbox's workspace. `confirm` runs the test command instead of
 * asking Claude when it is set, failing when the command does (ADR 0010).
 */
export const claudeReproducer = (parts: ReproducerParts) =>
  Reproducer.of({
    capture: (task) =>
      parts.runner
        .run(
          {
            role: parts.capture,
            workItemId: task.workItemId,
            instructions: fillTemplate(parts.capture.template, task),
            jsonSchema: capturing.jsonSchema,
            cwd: workingDirOf(parts.plugin, task.sandboxRef),
          },
          capturing.answer,
        )
        .pipe(
          Effect.flatMap(({ answer }): Effect.Effect<Captured, ArtifactNotStored> =>
            answer._tag === "captured"
              ? Effect.map(
                  parts.store(task.workItemId, "reproduction", answer.reproduction),
                  (reproductionRef) => ({ _tag: "captured" as const, reproductionRef }),
                )
              : Effect.succeed(answer),
          ),
          Effect.mapError(gaveUp),
        ),
    confirm: (task) =>
      (parts.tests === null
        ? confirmedByClaude(parts, task)
        : confirmedByTests(parts.tests, workingDirOf(parts.plugin, task.sandboxRef))
      ).pipe(Effect.mapError(gaveUp)),
  });

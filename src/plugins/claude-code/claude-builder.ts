import { Effect, Schema } from "effect";

import type { BuildTask, FixTask, ReproductionCheckTask, TestReport } from "../../index.ts";
import { Builder, BuilderGaveUp } from "../../index.ts";
import type { PluginSettings } from "./claude-code-options.ts";
import { workingDirOf } from "./claude-code-options.ts";
import type { ClaudeRunner } from "./claude-runner.ts";
import { portAnswerOf } from "./port-answer.ts";
import type { Role } from "./roles.ts";
import { fillTemplate } from "./roles.ts";
import type { TestCommandRunner, TestRun } from "./test-command.ts";

const changing = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("done", {}),
    Schema.TaggedStruct("stuck", { reason: Schema.NonEmptyString }),
  ]),
);

const reporting = portAnswerOf(
  Schema.Union([
    Schema.TaggedStruct("passed", {}),
    Schema.TaggedStruct("failed", { failures: Schema.String }),
  ]),
);

/** The roles and collaborators the Claude Code builder works with. */
export interface BuilderParts {
  readonly runner: ClaudeRunner;
  readonly implement: Role;
  readonly test: Role;
  readonly fix: Role;
  readonly checkReproduction: Role;
  readonly plugin: PluginSettings;
  readonly tests: TestCommandRunner | null;
}

const gaveUp = (failure: { readonly message: string }) =>
  new BuilderGaveUp({ message: failure.message });

const claudeReport = (parts: BuilderParts, role: Role, task: BuildTask | ReproductionCheckTask) =>
  Effect.map(
    parts.runner.run(
      {
        role,
        workItemId: task.workItemId,
        instructions: fillTemplate(role.template, task),
        jsonSchema: reporting.jsonSchema,
        cwd: workingDirOf(parts.plugin, task.sandboxRef),
      },
      reporting.answer,
    ),
    ({ answer }): TestReport => answer,
  );

const reportOf = (run: TestRun): TestReport =>
  run._tag === "passed" ? { _tag: "passed" } : { _tag: "failed", failures: run.output };

const reported = (parts: BuilderParts, role: Role, task: BuildTask | ReproductionCheckTask) =>
  (parts.tests === null
    ? claudeReport(parts, role, task)
    : Effect.map(parts.tests.run(workingDirOf(parts.plugin, task.sandboxRef)), reportOf)
  ).pipe(Effect.mapError(gaveUp));

const changed = (parts: BuilderParts, role: Role, task: BuildTask | FixTask) =>
  parts.runner
    .run(
      {
        role,
        workItemId: task.workItemId,
        instructions: fillTemplate(role.template, task),
        jsonSchema: changing.jsonSchema,
        cwd: workingDirOf(parts.plugin, task.sandboxRef),
      },
      changing.answer,
    )
    .pipe(
      Effect.mapError(gaveUp),
      Effect.flatMap(({ answer }) =>
        answer._tag === "done"
          ? Effect.void
          : Effect.fail(new BuilderGaveUp({ message: answer.reason })),
      ),
    );

/**
 * The Builder port done in the code-changing `implement`, `test`, `fix` and
 * `checkReproduction` roles, in the sandbox's workspace. `test` and
 * `checkReproduction` run the test command instead of asking Claude when it is
 * set, passing only when it exits 0 (ADR 0010).
 */
export const claudeBuilder = (parts: BuilderParts) =>
  Builder.of({
    implement: (task) => changed(parts, parts.implement, task),
    test: (task) => reported(parts, parts.test, task),
    fix: (task) => changed(parts, parts.fix, task),
    checkReproduction: (task) => reported(parts, parts.checkReproduction, task),
  });
